const fs=require('fs');const env=fs.readFileSync('.env','utf8').match(/^MONGODB_URI=(.*)$/m)[1].trim();
const m=require('mongoose');(async()=>{await m.connect(env);const d=m.connection.db;
console.log('db',d.databaseName);
for(const c of await d.listCollections().toArray()){console.log(c.name,await d.collection(c.name).countDocuments());}
const pos=await d.collection('purchaseorders').find({}, {projection:{poNumber:1,status:1,'customerDetails.name':1,createdAt:1}}).toArray();console.log(JSON.stringify(pos));
console.log(JSON.stringify(await d.collection('users').find({}, {projection:{email:1,roles:1}}).toArray()));
await m.disconnect();})();
