// The account handlers share D1's prepared-statement and batch contracts
// with the local SQLite server. Batch writes are atomic on both runtimes.
export function sqliteD1(db){
  const adapt=(sql,args=[])=>{
    const write=()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}});
    return {
      bind:(...values)=>adapt(sql,values),
      first:async()=>db.prepare(sql).get(...args)||null,
      all:async()=>({results:db.prepare(sql).all(...args)}),
      run:async()=>write(),
      write,
    };
  };
  return {prepare:adapt,batch:async statements=>{
    db.exec('BEGIN');
    try {const results=statements.map(statement=>statement.write());db.exec('COMMIT');return results;}
    catch(error){db.exec('ROLLBACK');throw error;}
  }};
}
