const test=require('node:test');
const assert=require('node:assert/strict');

test('release audit uses bounded read-only connections and emits only whitelisted metric names',async()=>{
  const {auditAnalytics}=await import('../scripts/audit-analytics-release.mjs');
  const logs=[],options=[],queries=[],closed=[];
  const result=await auditAnalytics('postgres://private-user:private-password@localhost/private-db',{
    log:value=>logs.push(value),
    createSql:(connection,config)=>{
      options.push(config);
      const index=options.length;
      const sql=async(strings)=>{
        queries.push(strings.join(''));
        return index===1?[{value:1}]:[
          {metric:'catalog_view',value:'5'},
          {metric:'telegram_redirect',value:'1'},
          {metric:'detail_view',value:'0'},
          {metric:'private-record',value:'999',private_url:'https://private.test/signature'}
        ];
      };
      sql.end=async()=>{closed.push(index);};
      return sql;
    }
  });
  assert.deepEqual(result,{todayHasEvents:true,metricsPresent:['telegram_redirect','catalog_view']});
  assert.equal(options.length,2);
  for(const config of options) {
    assert.equal(config.max,1);
    assert.equal(config.prepare,false);
    assert.equal(config.connection.default_transaction_read_only,'on');
  }
  assert.equal(options[0].connect_timeout,3);
  assert.equal(options[0].connection.statement_timeout,250);
  assert.equal(options[1].connect_timeout,5);
  assert.ok(queries.every(query=>query.trim().startsWith('SELECT')));
  assert.deepEqual(closed,[1,2]);
  const output=JSON.stringify(logs);
  for(const secret of ['private-user','private-password','private-record','private_url','999','private.test'])assert.equal(output.includes(secret),false);
});

test('release audit records a finite connection diagnosis, then still checks stored events',async()=>{
  const {auditAnalytics,failureCategory}=await import('../scripts/audit-analytics-release.mjs');
  let calls=0,closed=0;
  const logs=[];
  const result=await auditAnalytics('postgres://example.neon.tech/db?sslmode=require',{
    log:value=>logs.push(value),
    createSql:(connection,config)=>{
      assert.equal(config.ssl,'require');
      const index=++calls;
      const sql=async()=>{if(index===1)throw Object.assign(new Error('private connection details'),{code:'CONNECT_TIMEOUT'});return [];};
      sql.end=async()=>{closed++;};return sql;
    }
  });
  assert.deepEqual(result,{todayHasEvents:false,metricsPresent:[]});
  assert.deepEqual(logs[0],{area:'release_qa',code:'ANALYTICS_RUNTIME_CONNECTION_FAILED',category:'CONNECT_TIMEOUT'});
  assert.equal(closed,2);
  assert.equal(JSON.stringify(logs).includes('private connection details'),false);
  for(const code of ['__proto__','constructor','private-secret'])assert.equal(failureCategory({code}),'UNKNOWN');
});

test('release audit fails closed on unreadable metrics and closes both pools',async()=>{
  const {auditAnalytics}=await import('../scripts/audit-analytics-release.mjs');
  let calls=0,closed=0;
  await assert.rejects(auditAnalytics('postgres://localhost/fixture',{
    log:()=>{},
    createSql:()=>{
      const index=++calls;
      const sql=async()=>{if(index===2)throw Object.assign(new Error('fixture failure'),{code:'42P01'});return [];};
      sql.end=async()=>{closed++;};return sql;
    }
  }),{code:'42P01'});
  assert.equal(closed,2);
});
