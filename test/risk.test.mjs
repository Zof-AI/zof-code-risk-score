import test from'node:test';import assert from'node:assert/strict';import{mkdtemp,mkdir,writeFile,rm,symlink}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{execFileSync}from'node:child_process';import{scoreRisk,analyzeRisk,DEFAULT_WEIGHTS,formatReport}from'../dist/index.js';
const roots=[];async function fixture(files){const root=await mkdtemp(join(tmpdir(),'zof-risk-'));roots.push(root);for(const[p,s]of Object.entries(files)){await mkdir(join(root,p,'..'),{recursive:true});await writeFile(join(root,p),s);}return root;}test.after(async()=>{for(const r of roots)await rm(r,{recursive:true,force:true});});
const input=(path='src/math.ts',addedLines=4,deletedLines=2)=>({changes:[{path,addedLines,deletedLines}],coverage:{coveredLines:90,totalLines:100}});
test('controlled path change adds exactly the public authentication weight',()=>{const base=scoreRisk(input());const auth=scoreRisk(input('src/auth/login.ts'));assert.equal(base.score,3.8);assert.equal(auth.score-base.score,DEFAULT_WEIGHTS.authentication);assert.equal(auth.signals.find(s=>s.rule==='authentication').input,1);assert.deepEqual(auth.signals.find(s=>s.rule==='authentication').paths,['src/auth/login.ts']);assert.equal(auth.advisory,true);assert.equal(auth.verificationResult,'not-run');});
test('line count, file count, each path rule and coverage change produce documented deltas',()=>{
 const base=scoreRisk(input());assert.equal(scoreRisk(input('src/math.ts',24,2)).score-base.score,1);
 const paths={payments:'src/payments/charge.ts',migrations:'db/migrations/001.sql',publicApi:'api/openapi.yaml',concurrency:'src/workers/job.ts',dependencies:'package-lock.json',configuration:'config/settings.json'};
 for(const[rule,path]of Object.entries(paths)){const report=scoreRisk(input(path));assert.equal(report.signals.find(s=>s.rule===rule).contribution,DEFAULT_WEIGHTS[rule]);}
 const coverage=scoreRisk({...input(),coverage:{coveredLines:80,totalLines:100}});assert.equal(coverage.score-base.score,1.5);
 const two=scoreRisk({...input(),changes:[...input().changes,{path:'src/other.ts',addedLines:0,deletedLines:0}]});assert.equal(two.score-base.score,2);
});
test('configurable weights, exact contribution sum and bands are transparent',()=>{
 const r=scoreRisk(input('src/auth/login.ts'),{weights:{authentication:25,changedLines:.1},bands:{medium:20,high:50}});assert.equal(r.score,29.1);assert.equal(r.band,'medium');assert.equal(r.rawScore,Math.round(r.signals.reduce((sum,s)=>sum+s.contribution,0)*100)/100);
 for(const s of r.signals)assert.equal(s.contribution,Math.round((s.input*s.weight+Number.EPSILON)*100)/100);
 const frac=scoreRisk({changes:[{path:'a.ts',addedLines:0,deletedLines:0}],coverage:{coveredLines:2,totalLines:3}});const gap=frac.signals.find(s=>s.rule==='coverageGap');assert.equal(gap.contribution,5);assert.match(gap.explanation,/round2\(0\.333/);
 assert.equal(scoreRisk(input('src/auth/login.ts'),{weights:{authentication:1000}}).score,100);assert.match(formatReport(r),/not a guarantee/);
});
test('missing coverage and line observations are unknown, never inferred as pass',()=>{const r=scoreRisk({changes:[{path:'src/math.ts'}]});assert.equal(r.scoreMeaning,'partial-inputs');assert.deepEqual(r.missingInputs,['changedLines','coverage']);assert.equal(r.signals.find(s=>s.rule==='changedLines').input,null);assert.equal(r.signals.find(s=>s.rule==='coverageGap').input,null);assert.equal(r.verificationResult,'not-run');});
test('invalid inputs, traversal, duplicates, unknown fields and unsafe weights are rejected',()=>{
 for(const i of[{},null,{changes:'x'},{changes:[{path:'../secret'}]},{changes:[{path:'/secret'}]},{changes:[{path:'a.ts',addedLines:-1}]},{changes:[{path:'a.ts',deletedLines:Infinity}]},{changes:[{path:'a.ts'},{path:'a.ts'}]},{changes:[],coverage:{coveredLines:2,totalLines:1}},{changes:[],coverage:{coveredLines:0,totalLines:0}},{changes:[],secret:'synthetic'}])assert.throws(()=>scoreRisk(i));
 for(const c of[{weights:{authentication:-1}},{weights:{authentication:Infinity}},{weights:{unknown:1}},{bands:{medium:80,high:10}},{bands:{medium:1,high:200}}])assert.throws(()=>scoreRisk(input(),c));
 assert.throws(()=>scoreRisk({changes:Array.from({length:10001},(_,i)=>({path:`${i}.ts`}))}));
});
test('synthetic credentials are redacted and arbitrary environment values omitted',()=>{const secret='ghp_'+'Z'.repeat(36);process.env.SYNTHETIC_PRIVATE_ENV='do-not-copy-this';const output=JSON.stringify(scoreRisk(input(`${secret}.ts`)));assert.ok(!output.includes(secret));assert.ok(!output.includes('do-not-copy-this'));delete process.env.SYNTHETIC_PRIVATE_ENV;});
test('safe JSON file flow handles valid inputs and rejects malformed, oversized, symlink and URL paths',async()=>{
 const root=await fixture({'input.json':JSON.stringify(input()),'config.json':'{"weights":{"changedFiles":4}}','invalid.json':'{no}','large.json':'x'.repeat(1024*1024+1)});const r=await analyzeRisk({root,inputFile:'input.json',configFile:'config.json'});assert.equal(r.score,5.8);
 for(const f of['invalid.json','large.json','../outside','https://example.invalid/secret'])await assert.rejects(analyzeRisk({root,inputFile:f}));
 if(process.platform!=='win32'){await symlink(join(root,'input.json'),join(root,'link.json'));await assert.rejects(analyzeRisk({root,inputFile:'link.json'}));}
});
test('real Git changes produce exact changed-line and authentication contributions',async()=>{
 const root=await fixture({'auth/login.ts':'export const permitted=false;\n'});const git=(...args)=>execFileSync('git',['-C',root,...args],{stdio:'ignore'});git('init','-b','main');git('config','user.name','Synthetic');git('config','user.email','fixture@example.invalid');git('add','.');git('commit','-m','fixture');await writeFile(join(root,'auth/login.ts'),'export const permitted=true;\n');
 const r=await analyzeRisk({root,coverage:{coveredLines:100,totalLines:100}});assert.equal(r.score,17.1);assert.equal(r.scoreMeaning,'observed-inputs');
 const explicit=await analyzeRisk({root,changedFiles:['auth/login.ts']});assert.ok(explicit.missingInputs.includes('changedLines'));
});
test('documented CLI examples and generic errors are correct',()=>{
 const run=(args)=>execFileSync(process.execPath,['dist/cli.js','--root','examples',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert.equal(JSON.parse(run(['--input','small-change.json','--json'])).score,3.8);assert.equal(JSON.parse(run(['--input','auth-change.json','--json'])).score,18.8);assert.equal(JSON.parse(run(['--input','auth-change.json','--config','custom-weights.json','--json'])).score,29.1);
 assert.throws(()=>run(['--input','../synthetic-secret']),e=>e.status===2&&!e.stderr.includes('synthetic-secret'));
});

test('empty measured change set has zero score even with low coverage',()=>{const r=scoreRisk({changes:[],coverage:{coveredLines:0,totalLines:100}});assert.equal(r.score,0);assert.deepEqual(r.missingInputs,[]);assert.equal(r.verificationResult,'not-run');});
