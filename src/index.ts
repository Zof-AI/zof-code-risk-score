import { analyzeImpact } from '@zof-ai/change-impact';
import type { AnalyzeOptions } from '@zof-ai/change-impact';
import { assertSafeRelativePath, redact, safeReadJson } from '@zof-ai/evidence-spec';
export const DEFAULT_WEIGHTS = Object.freeze({ changedFiles: 2, changedLines: 0.05, authentication: 15, payments: 15, migrations: 12, publicApi: 10, concurrency: 10, coverageGap: 15, dependencies: 12, configuration: 5 });
export type RuleId=keyof typeof DEFAULT_WEIGHTS;
export interface RiskChange { path: string; addedLines?: number; deletedLines?: number }
export interface RiskInput { changes: RiskChange[]; coverage?: {coveredLines:number;totalLines:number} }
export interface RiskConfig { weights?: Partial<Record<RuleId,number>>; bands?: {medium:number;high:number} }
export interface RiskReport {
 schemaVersion:'risk/v1';score:number;rawScore:number;band:'low'|'medium'|'high';scoreMeaning:'observed-inputs'|'partial-inputs';
 signals:{rule:RuleId;input:number|null;weight:number;contribution:number;paths:string[];explanation:string}[];
 missingInputs:string[];limitations:string[];advisory:true;verificationResult:'not-run';
}
export interface AnalyzeRiskOptions extends AnalyzeOptions { config?:RiskConfig;configFile?:string;coverage?:RiskInput['coverage'];coverageFile?:string;inputFile?:string }
const pathRules:Record<Exclude<RuleId,'changedFiles'|'changedLines'|'coverageGap'>,RegExp>={
 authentication:/(?:^|[\/_.-])(?:auth|authentication|authorization|login|oauth|session|credentials?)(?:[\/_.-]|$)/i,
 payments:/(?:^|[\/_.-])(?:payment|payments|billing|checkout|invoice|invoices|stripe)(?:[\/_.-]|$)/i,
 migrations:/(?:^|[\/_.-])(?:migration|migrations|db-migrate)(?:[\/_.-]|$)/i,
 publicApi:/(?:^|[\/_.-])(?:api|openapi|swagger|graphql|proto|protobuf)(?:[\/_.-]|$)|\.proto$/i,
 concurrency:/(?:^|[\/_.-])(?:concurrency|thread|threads|worker|workers|mutex|semaphore|async|queue|lock)(?:[\/_.-]|$)/i,
 dependencies:/(?:^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|requirements(?:-[^/]*)?\.txt|Pipfile(?:\.lock)?|poetry\.lock|pyproject\.toml|Cargo\.(?:toml|lock)|go\.(?:mod|sum))$/i,
 configuration:/(?:^|[\/_.-])(?:config|configuration|settings)(?:[\/_.-]|$)|(?:^|\/)(?:Dockerfile|docker-compose\.[^.]+|tsconfig[^/]*\.json)|^\.github\//i
};
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function keys(value:Record<string,unknown>,allowed:string[]):void{if(Object.keys(value).some(k=>!allowed.includes(k)))throw new Error('Unexpected input field');}
function count(value:unknown,max=10000000):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max;}
function validateInput(value:unknown):RiskInput{
 if(!record(value))throw new Error('Invalid risk input');keys(value,['changes','coverage']);
 if(!Array.isArray(value.changes)||value.changes.length>10000)throw new Error('Risk changes exceed supported limits');
 const seen=new Set<string>();for(const change of value.changes){if(!record(change))throw new Error('Invalid risk change');keys(change,['path','addedLines','deletedLines']);if(typeof change.path!=='string')throw new Error('Invalid risk path');assertSafeRelativePath(change.path);if(seen.has(change.path))throw new Error('Duplicate risk change');seen.add(change.path);for(const field of ['addedLines','deletedLines'])if(change[field]!==undefined&&!count(change[field]))throw new Error('Invalid changed-line count');}
 if(value.coverage!==undefined){if(!record(value.coverage))throw new Error('Invalid coverage metadata');keys(value.coverage,['coveredLines','totalLines']);if(!count(value.coverage.totalLines)||value.coverage.totalLines===0||!count(value.coverage.coveredLines)||value.coverage.coveredLines>value.coverage.totalLines)throw new Error('Invalid coverage metadata');}
 return value as unknown as RiskInput;
}
function configuration(value:unknown):{weights:Record<RuleId,number>;bands:{medium:number;high:number}}{
 if(!record(value))throw new Error('Invalid risk configuration');keys(value,['weights','bands']);const weights:Record<RuleId,number>={...DEFAULT_WEIGHTS};
 if(value.weights!==undefined){if(!record(value.weights))throw new Error('Invalid heuristic weights');keys(value.weights,Object.keys(DEFAULT_WEIGHTS));for(const [rule,weight]of Object.entries(value.weights)){if(typeof weight!=='number'||!Number.isFinite(weight)||weight<0||weight>1000)throw new Error('Invalid heuristic weight');weights[rule as RuleId]=weight;}}
 let bands={medium:30,high:60};if(value.bands!==undefined){if(!record(value.bands))throw new Error('Invalid advisory bands');keys(value.bands,['medium','high']);const {medium,high}=value.bands;if(typeof medium!=='number'||typeof high!=='number'||!Number.isFinite(medium)||!Number.isFinite(high)||medium<0||high>100||medium>=high)throw new Error('Invalid advisory bands');bands={medium,high};}
 return{weights,bands};
}
const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export function scoreRisk(input:RiskInput,config:RiskConfig={}):RiskReport{
 const data=validateInput(input);const {weights,bands}=configuration(config);const paths=data.changes.map(c=>c.path).sort();const missingInputs:string[]=[];
 const lineKnown=data.changes.every(c=>c.addedLines!==undefined&&c.deletedLines!==undefined);if(!lineKnown)missingInputs.push('changedLines');if(data.changes.length&&!data.coverage)missingInputs.push('coverage');
 const signals:RiskReport['signals']=[];
 const add=(rule:RuleId,value:number|null,paths:string[],description:string)=>signals.push({rule,input:value,weight:weights[rule],contribution:value===null?0:round(value*weights[rule]),paths,explanation:value===null?'Input unavailable; no contribution is inferred.':`${description}; round2(${value} × ${weights[rule]}) = ${round(value*weights[rule])}.`});
 add('changedFiles',data.changes.length,paths,'Changed file count');
 add('changedLines',lineKnown?data.changes.reduce((sum,c)=>sum+c.addedLines!+c.deletedLines!,0):null,[],'Added plus deleted line count');
 for(const [id,rule]of Object.entries(pathRules)){const matched=paths.filter(p=>rule.test(p));add(id as RuleId,matched.length,matched,'Matching changed path count');}
 add('coverageGap',!data.changes.length?0:data.coverage?1-data.coverage.coveredLines/data.coverage.totalLines:null,[],'Uncovered line fraction');
 const rawScore=round(signals.reduce((sum,s)=>sum+s.contribution,0));const score=Math.min(100,rawScore);
 const report:RiskReport={schemaVersion:'risk/v1',score,rawScore,band:score>=bands.high?'high':score>=bands.medium?'medium':'low',scoreMeaning:missingInputs.length?'partial-inputs':'observed-inputs',signals,missingInputs,limitations:['This public heuristic is advisory and is not a guarantee of safety or a test result.','Path labels can miss sensitive logic in generically named files or flag unrelated names.','Coverage metadata is supplied by the caller and does not establish behavioral coverage.','Missing inputs contribute zero but are explicitly unknown; a low score with missing data is not evidence of low risk.','Signals can overlap; the total is the rounded sum of contributions capped at 100.','These documented weights are independently defined examples, not a proprietary Zof risk model.'],advisory:true,verificationResult:'not-run'};
 return redact(report);
}
export async function analyzeRisk(options:AnalyzeRiskOptions):Promise<RiskReport>{
 if(!options||typeof options.root!=='string')throw new Error('Repository root is required');if(options.config&&options.configFile)throw new Error('Conflicting config sources');if(options.coverage&&options.coverageFile)throw new Error('Conflicting coverage sources');
 const config=options.configFile?await safeReadJson(options.root,options.configFile,256*1024) as RiskConfig:options.config;
 const coverage=options.coverageFile?await safeReadJson(options.root,options.coverageFile,256*1024) as RiskInput['coverage']:options.coverage;
 if(options.inputFile){if(options.base||options.head||options.changedFiles||coverage)throw new Error('Explicit risk input conflicts with Git or coverage options');return scoreRisk(await safeReadJson(options.root,options.inputFile,1024*1024) as RiskInput,config);}
 const impact=await analyzeImpact(options);const linesKnown=options.changedFiles===undefined;
 const changes=impact.changes.map(c=>linesKnown?{path:c.path,addedLines:c.addedLines,deletedLines:c.deletedLines}:{path:c.path});
 const report=scoreRisk({changes,...(coverage?{coverage}:{})},config);
 if(!impact.complete){report.scoreMeaning='partial-inputs';report.missingInputs.push('completeChangeAnalysis');report.limitations.push(...impact.limitations.map(l=>l.message));}
 return redact(report);
}
export function formatReport(report:RiskReport):string{return redact([`Advisory change score: ${report.score}/100 (${report.band}; ${report.scoreMeaning})`,...report.signals.map(s=>`${s.rule}: ${s.contribution} — ${s.explanation}`),`Missing inputs: ${report.missingInputs.join(', ')||'none'}`,...report.limitations.map(l=>`Limitation: ${l}`),'Verification: not-run'].join('\n'));}
