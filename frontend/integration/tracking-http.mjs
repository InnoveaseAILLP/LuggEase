/** Real frontend API + tracking client over HTTP to isolated real FastAPI routes. */
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const scriptDirectory=path.dirname(fileURLToPath(import.meta.url));
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {buildSync} from 'esbuild';
const root=path.resolve(scriptDirectory,'../..');
const scratch=mkdtempSync(path.join(tmpdir(),'luggease-http-sit-'));
const child=spawn(path.join(root,'.venv/bin/python'),[path.join(root,'backend/tests/system/tracking_server.py')],{cwd:path.join(root,'backend'),env:{...process.env,LUGGEASE_ALLOW_ISOLATED_SIT:'1'},stdio:['ignore','pipe','pipe']});
let diagnostic='';child.stderr.on('data',chunk=>{diagnostic+=chunk.toString();});
async function run(){
 const port=await new Promise((resolve,reject)=>{
  let output='';const timer=setTimeout(()=>reject(new Error('Isolated service startup timed out')),15000);
  child.once('exit',()=>{clearTimeout(timer);reject(new Error('Isolated service exited: '+diagnostic));});
  child.stdout.on('data',chunk=>{output+=chunk.toString();const line=output.split('\n').find(value=>value.startsWith('{"port":'));if(line){clearTimeout(timer);resolve(JSON.parse(line).port);}});
 });
 const base=`http://127.0.0.1:${port}`;
 for(let i=0;i<40;i++){try{await fetch(base+'/api/health');break;}catch(error){if(i===39)throw error;await new Promise(resolve=>setTimeout(resolve,50));}}
 const envFile=path.join(scratch,'env.ts');writeFileSync(envFile,`export const baseUrl=()=>${JSON.stringify(base)};`);
 const bundle=path.join(scratch,'client.mjs');
 buildSync({stdin:{contents:"export {api,setTokenProvider} from './src/api';export {shareShipmentPosition} from './src/shipment-location';",resolveDir:path.join(root,'frontend')},tsconfig:path.join(root,'frontend/tsconfig.json'),bundle:true,platform:'node',format:'esm',outfile:bundle,alias:{'@/src/env':envFile},logLevel:'silent'});
 const {api,setTokenProvider,shareShipmentPosition}=await import(pathToFileURL(bundle).href);
 setTokenProvider(async()=>null);await assert.rejects(api('/orders/SIT-LIVE/tracking'),/sign in/);
 setTokenProvider(async()=>'sit-partner');
 const fix={latitude:11.01,longitude:77,accuracy:15,captured_at:new Date().toISOString(),mocked:false};
 const received=await shareShipmentPosition('SIT-LIVE',fix);assert.ok(Number.isFinite(Date.parse(received)));
 setTokenProvider(async()=>'sit-customer');
 const visible=await api('/orders/SIT-LIVE/tracking');assert.equal(visible.points.length,1);assert.equal(visible.points[0].received_at,received);assert.equal(visible.sharing_active,true);
 assert.equal('partner_id' in visible.points[0],false);assert.equal('recorded_at' in visible.points[0],false);
 await assert.rejects(shareShipmentPosition('SIT-LIVE',fix),/permission/);
 await assert.rejects(api('/orders/SIT-NOT-STARTED/tracking'),/In transit/);
 setTokenProvider(async()=>'sit-outsider');await assert.rejects(api('/orders/SIT-LIVE/tracking'),/not found/);
 const report={result:'passed',transport:'real loopback HTTP; real frontend API and tracking helper; real FastAPI routes',isolation:'in-memory Mongo substitute; synthetic identities and coordinates; no production records or external providers',checks:['unauthenticated blocked','partner upload read back by real client','customer reads same receipt and coordinates','private fields omitted','customer cannot upload','map disabled before transit','unrelated customer denied'],real_gps:false,real_money:false};
 writeFileSync(path.join(root,'test_reports/system-integration-http.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
run().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}rmSync(scratch,{recursive:true,force:true});});
