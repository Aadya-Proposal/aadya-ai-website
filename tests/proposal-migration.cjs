const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../scripts/migrate-proposal-pdfs.cjs'),'utf8');
async function run({apply=false,conflict=false,duplicate=false}={}) {
 const files=new Map([['token.pdf',new Blob(['original'])]]);if(conflict)files.set('uid/token.pdf',new Blob(['different']));
 const rows=[{id:'p1',user_email:'owner@example.test',pdf_url:'https://project.supabase.co/storage/v1/object/proposals/token.pdf',pdf_path:null}];
 if(duplicate)rows.push({id:'p2',user_email:'other@example.test',pdf_url:rows[0].pdf_url,pdf_path:null});
 let copies=0,updates=0;
 const client={auth:{admin:{listUsers:async()=>({data:{users:[{id:'uid',email:'owner@example.test'},{id:'other',email:'other@example.test'}]}})}},
 storage:{from:()=>({download:async p=>files.has(p)?{data:files.get(p)}:{error:{message:'missing'}},copy:async(a,b)=>{copies++;if(files.has(b))return {error:{message:'exists'}};files.set(b,files.get(a));return {data:{}}}})},
 from(){let update;const q={select(){if(update){updates++;rows[0].pdf_path=update.pdf_path;return Promise.resolve({data:[{id:'p1'}]})}return q},order(){return q},range:async()=>({data:rows}),update(v){update=v;return q},eq(){return q},is(){return q}};return q;}};
 const processMock={argv:apply?['--apply']:[],env:{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'mock-only'}};
 const context=vm.createContext({require:n=>n==='@supabase/supabase-js'?{createClient:()=>client}:require(n),process:processMock,console:{log(){},error(){}},URL,Buffer,Blob});
 await vm.runInContext(source,context);
 return {copies,updates,files,rows,exit:processMock.exitCode};
}
(async()=>{
 let r=await run();assert.equal(r.copies,0);assert.equal(r.updates,0);console.log('PASS dry-run never copies or updates');
 r=await run({apply:true});assert.equal(r.updates,1);assert.equal(r.rows[0].pdf_path,'uid/token.pdf');assert.ok(r.files.has('token.pdf'));console.log('PASS apply verifies, maps and preserves original');
 r=await run({apply:true,conflict:true});assert.equal(r.updates,0);assert.equal(r.exit,1);console.log('PASS conflicting destination never mapped');
 r=await run({apply:true,duplicate:true});assert.equal(r.copies,0);assert.equal(r.updates,0);assert.equal(r.exit,1);console.log('PASS ambiguous ownership never copied');
})().catch(e=>{console.error(e);process.exitCode=1});
