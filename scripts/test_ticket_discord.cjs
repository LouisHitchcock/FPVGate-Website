const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
function setup(){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('store/migrations/0008_support_tickets.sql','utf8'));db.exec(fs.readFileSync('store/migrations/0010_ticket_discord_notifications.sql','utf8'));
 const calls=[];let fail=false;
 const context=vm.createContext({URL,crypto,AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return fail?{ok:false,status:429}:{ok:true,json:async()=>({id:'123456789012345678'})}}});
 vm.runInContext(fs.readFileSync('store/support-discord.js','utf8').replace(/export /g,''),context);
 vm.runInContext(fs.readFileSync('store/support.js','utf8').replace(/import[^;]+;/g,'').replace(/export /g,''),context);
 const DB={prepare(sql){const statement=db.prepare(sql);const bind=(...args)=>({first:async()=>statement.get(...args),all:async()=>({results:statement.all(...args)}),run:async()=>statement.run(...args)});return {...bind(),bind}},async batch(statements){for(const statement of statements)await statement.run()}};
 const env={DB};const create=type=>context.createSupportTicket(env,{type,subject:'Private subject @everyone',contact:'Private name',email:'private@example.com',message:'Private message',application:{business:'Private company'}});
 return {env,context,db,calls,create,setFail:value=>fail=value};
}
const webhook='https://discord.com/api/webhooks/123456789012345678/test-secret';
test('a separate webhook is required and existing order webhook is never used',async()=>{
 const s=setup();s.env.DISCORD_WEBHOOK_URL=webhook;const ticket=await s.create('support');assert.equal(s.calls.length,0);assert.equal(s.db.prepare('SELECT discord_notification_status FROM support_tickets WHERE id=?').get(ticket.id).discord_notification_status,'not_configured');
});
test('both categories send confirmed alerts with private admin links and no customer content',async()=>{
 const s=setup();s.env.DISCORD_SUPPORT_WEBHOOK_URL=webhook;const support=await s.create('support');await s.create('distributor');assert.equal(s.calls.length,2);
 assert.equal(s.calls[0].body.embeds[0].title,'New support ticket');assert.equal(s.calls[1].body.embeds[0].title,'New business enquiry');
 assert.ok(s.calls[0].url.includes('wait=true'));assert.ok(s.calls[0].body.embeds[0].url.includes('section=support'));assert.ok(s.calls[1].body.embeds[0].url.includes('section=business'));
 assert.ok(!JSON.stringify(s.calls.map(call=>call.body)).includes('Private'));assert.ok(!JSON.stringify(s.calls.map(call=>call.body)).includes('private@example.com'));assert.deepEqual(Array.from(s.calls[0].body.allowed_mentions.parse),[]);
 const row=s.db.prepare('SELECT * FROM support_tickets WHERE id=?').get(support.id);assert.equal(row.discord_notification_status,'sent');assert.ok(row.discord_notified_at);assert.equal(row.discord_message_id,'123456789012345678');
});
test('delivery failure preserves the ticket and supports retry without duplicate confirmed sends',async()=>{
 const s=setup();s.env.DISCORD_SUPPORT_WEBHOOK_URL=webhook;s.setFail(true);const ticket=await s.create('support');assert.equal(s.db.prepare('SELECT discord_notification_status FROM support_tickets WHERE id=?').get(ticket.id).discord_notification_status,'failed');
 s.setFail(false);assert.equal((await s.context.notifyTicketDiscord(s.env,ticket.id)).status,'sent');assert.equal((await s.context.notifyTicketDiscord(s.env,ticket.id)).status,'sent');assert.equal(s.calls.length,2);
});
test('concurrent sends claim delivery once, optional role is the only allowed mention',async()=>{
 const s=setup();const ticket=await s.create('support');s.env.DISCORD_SUPPORT_WEBHOOK_URL=webhook;s.env.DISCORD_SUPPORT_ROLE_ID='123456789012345678';
 await Promise.all([s.context.notifyTicketDiscord(s.env,ticket.id),s.context.notifyTicketDiscord(s.env,ticket.id)]);assert.equal(s.calls.length,1);assert.equal(s.calls[0].body.content,'<@&123456789012345678>');assert.deepEqual(Array.from(s.calls[0].body.allowed_mentions.roles),['123456789012345678']);
});
test('invalid webhook configuration never posts elsewhere',async()=>{
 const s=setup();s.env.DISCORD_SUPPORT_WEBHOOK_URL='https://other.example/api/webhooks/123/secret';await s.create('distributor');assert.equal(s.calls.length,0);assert.equal(s.db.prepare('SELECT discord_notification_status FROM support_tickets').get().discord_notification_status,'failed');
});
