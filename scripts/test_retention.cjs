const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const now=new Date('2026-11-17T12:00:00Z');
const cutoff=new Date(now.getTime()-365*86400000).toISOString();
function fixture(files,module,name){
 const db=new DatabaseSync(':memory:');
 for(const file of files)db.exec(fs.readFileSync(file,'utf8'));
 const context=vm.createContext({Date});
 vm.runInContext(fs.readFileSync(module,'utf8').replace('export async function','async function'),context);
 const binding={prepare(sql){const s=db.prepare(sql);return {bind(...args){return {sql,args}}}},async batch(statements){db.exec('BEGIN');try{for(const s of statements)db.prepare(s.sql).run(...s.args);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}};
 return {db,clean:()=>context[name](binding,now)};
}
test('analytics expires identifying details, preserves only fixed monthly counts, and runs idempotently',async()=>{
 const {db,clean}=fixture(['analytics/schema.sql','analytics/migration_retention.sql'],'analytics/retention.js','runAnalyticsRetention');
 const add=db.prepare('INSERT INTO analytics_events(event_name,timestamp,ip_hash,error_message) VALUES(?,?,?,?)');
 add.run('c5_flash_complete','2025-11-16T00:00:00Z','private-hash','private message');
 add.run('customer@example.com','2025-11-16T00:00:00Z','private-hash','private message');
 add.run('flash_complete',cutoff,'boundary','retained');
 await clean();await clean();
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n,1);
 assert.equal(db.prepare('SELECT timestamp FROM analytics_events').get().timestamp,cutoff);
 const rows=db.prepare('SELECT * FROM analytics_monthly_totals ORDER BY event_name').all();
 assert.deepEqual(rows.map(r=>({...r})),[{month:'2025-11',event_name:'c5_flash_complete',event_count:1},{month:'2025-11',event_name:'other',event_count:1}]);
 assert.doesNotMatch(JSON.stringify(rows),/private|customer|example/);
});
test('store expires ticket content and operational logs while keeping financial orders and anonymous counts',async()=>{
 const {db,clean}=fixture(['store/schema.sql','store/migrations/0001_email_log.sql','store/migrations/0007_distributor_enquiries.sql','store/migrations/0008_support_tickets.sql','store/migrations/0012_retention.sql'],'store/retention.js','runStoreRetention');
 db.exec("PRAGMA foreign_keys=ON; INSERT INTO orders(customer_name,customer_email,shipping_address,items,subtotal,total,created_at) VALUES('Accounting','shop@example.com','{}','[]',10,10,'2020-01-01');");
 const add=db.prepare("INSERT INTO support_tickets(id,reference,type,subject,contact_name,email,created_at) VALUES(?,?,'support','Private','Person','private@example.com',?)");
 add.run('old','OLD','2025-11-16T00:00:00Z');add.run('new','NEW',cutoff);
 db.exec("INSERT INTO support_messages(id,ticket_id,kind,body,created_at) VALUES('old-msg','old','note','Private','2026-11-17'); INSERT INTO email_log(email_type,recipient,subject,status,created_at) VALUES('support','private@example.com','Private','sent','2025-11-16'); INSERT INTO order_comments(order_id,comment,created_at) VALUES(1,'Private','2025-11-16'); INSERT INTO distributor_request_limits VALUES('private',0,3);");
 await clean();await clean();
 assert.deepEqual(db.prepare('SELECT id FROM support_tickets').all().map(r=>r.id),['new']);
 for(const table of ['support_messages','email_log','order_comments','distributor_request_limits'])assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,0,table);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,1);
 assert.equal(db.prepare('SELECT ticket_count FROM support_monthly_totals').get().ticket_count,1);
 assert.equal(db.prepare('SELECT message_count FROM email_monthly_totals').get().message_count,1);
});
