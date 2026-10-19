import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,mkdir,writeFile,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join,resolve}from'node:path';import{execFileSync}from'node:child_process';
const run=(args,options={})=>execFileSync(process.execPath,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000,...options});
test('clean install of packed candidate and candidate dependencies executes documented risk heuristics',async()=>{
 const npm=process.env.npm_execpath;assert.ok(npm);const root=await mkdtemp(join(tmpdir(),'zof-risk-pack-'));try{
 const pack=JSON.parse(run([npm,'pack','--ignore-scripts','--json','--pack-destination',root]))[0];assert.ok(pack.files.some(f=>f.path==='dist/index.d.ts'));assert.ok(pack.files.every(f=>!/^src\/|^test\/|\.map$|\.env/.test(f.path)));
 const project=join(root,'clean');await mkdir(project);await writeFile(join(project,'package.json'),'{"private":true,"type":"module"}');
 const dependencies=JSON.parse(await readFile(resolve('scripts/release-dependencies.json'),'utf8')).dependencies;
 const candidates=[];
 for(const dependency of dependencies){
  const installedRoot=resolve('node_modules',dependency.packageName);
  const installed=JSON.parse(await readFile(join(installedRoot,'package.json'),'utf8'));
  assert.equal(installed.name,dependency.packageName);assert.equal(installed.version,dependency.version);
  const candidate=JSON.parse(run([npm,'pack','--ignore-scripts','--json','--pack-destination',root],{cwd:installedRoot}))[0];
  assert.equal(candidate.name,dependency.packageName);assert.equal(candidate.version,dependency.version);
  candidates.push(join(root,candidate.filename));
 }
 run([npm,'install','--ignore-scripts','--no-audit','--no-fund',...candidates,join(root,pack.filename)],{cwd:project});
 const output=run(['--input-type=module','-e',"import{analyzeRisk}from'@zof-ai/code-risk-score';console.log(JSON.stringify(await analyzeRisk({root:'node_modules/@zof-ai/code-risk-score/examples',inputFile:'auth-change.json'})));"],{cwd:project});assert.equal(JSON.parse(output).score,18.8);
 const pkg=JSON.parse(await readFile(join(project,'node_modules/@zof-ai/code-risk-score/package.json'),'utf8'));assert.equal(pkg.dependencies['@zof-ai/change-impact'],'0.1.2');assert.equal(pkg.bin['zof-code-risk-score'],'./dist/cli.js');
 assert.match(run([npm,'exec','--offline','--','zof-code-risk-score','--help'],{cwd:project}),/Usage:/);
 }finally{await rm(root,{recursive:true,force:true});}
});
