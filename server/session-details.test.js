import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRecord} from './domain.js';
import {report} from '../src/stats.js';
import {exportDetails, matchesSubtype} from '../src/subtypes.js';

const details = [
  {subtype:'breaststroke',value:400,duration:240},
  {subtype:'butterfly',value:100,duration:60},
  {subtype:'freestyle',value:1000,duration:600},
];
test('one swim check-in stores three details and computes authoritative totals',()=>{
  const row = validateRecord({sport:'swimming',details:JSON.stringify(details),value:1,duration:1,occurredAt:'2026-10-20'});
  assert.equal(row.value,1500); assert.equal(row.duration,900);
  assert.equal(row.subtype,null); assert.deepEqual(row.details,details);
  for (const bad of [[],null,[details[0],details[0]],[{...details[0],subtype:'situps'}],[{...details[0],value:0}],[{...details[0],duration:0}],[{...details[0],duration:1.5}]]) {
    assert.throws(()=>validateRecord({sport:'swimming',details:JSON.stringify(bad),occurredAt:'2026-10-20'}));
  }
  assert.throws(()=>validateRecord({sport:'running',details,occurredAt:'2026-10-20'}));
  assert.throws(()=>validateRecord({sport:'swimming',details:'{broken',occurredAt:'2026-10-20'}));
  assert.throws(()=>validateRecord({sport:'swimming',details:[{...details[0],duration:86400},details[1]],occurredAt:'2026-10-20'}),'total duration is limited as well as individual details');
  assert.throws(()=>validateRecord({sport:'swimming',details:[{...details[0],value:100000},details[1]],occurredAt:'2026-10-20'}),'total volume is limited as well as individual details');
  const abs = validateRecord({sport:'abs',details:[{subtype:'situps',value:10,duration:600},{subtype:'abwheel',value:5,duration:300}],occurredAt:'2026-10-20'});
  assert.equal(abs.value,15); assert.equal(abs.duration,900); assert.equal(abs.details.length,2);
});

test('multi-type swim counts once across all report periods and filters only matching detail metrics',()=>{
  const row = {id:'one-session',sport:'swimming',value:1500,duration:900,details,subtype:null,occurredAt:new Date(2026,9,20,10).toISOString()};
  for(const period of ['week','month','year']) {
    const all = report([row],'swimming',period,new Date(2026,9,22));
    assert.equal(all.rows.length,1); assert.equal(all.total,1500); assert.equal(all.duration,900);
    assert.equal(all.bars.reduce((sum,b)=>sum+b.value,0),1500);
    assert.equal(all.breakdown.length,3,'a mixed session must not become unclassified');
    assert.deepEqual(all.breakdown.map(g=>[g.total,g.duration,g.count]),[[400,240,1],[100,60,1],[1000,600,1]]);
    const butterfly=report([row],'swimming',period,new Date(2026,9,22),'butterfly');
    assert.equal(butterfly.total,100); assert.equal(butterfly.duration,60); assert.equal(butterfly.rows.length,1);
    assert.equal(butterfly.rows[0].id,row.id); assert.equal(butterfly.rows[0].details.length,1);
    assert.equal(matchesSubtype(row,'unclassified'),false);
    assert.equal(report([row],'swimming',period,new Date(2026,9,22),'unclassified').total,0);
    assert.equal(row.value,1500,'report filters must not mutate stored session totals');
  }
  const exported=exportDetails([row]);
  assert.equal(exported.length,3); assert.equal(new Set(exported.map(r=>r.checkinId)).size,1);
  assert.equal(exportDetails([row],'freestyle')[0].value,1000);
});

test('both ab exercises share one check-in and legacy single-type records remain separate',()=>{
  const date=new Date(2026,9,20,10).toISOString();
  const rows=[{id:'new',sport:'abs',value:15,duration:900,occurredAt:date,details:[{subtype:'situps',value:10,duration:600},{subtype:'abwheel',value:5,duration:300}]},
    {id:'old',sport:'abs',value:2,duration:120,subtype:'abwheel',occurredAt:date},
    {id:'unclassified',sport:'abs',value:3,duration:180,occurredAt:date}];
  const all=report(rows,'abs','week',new Date(2026,9,22));
  assert.equal(all.rows.length,3);assert.equal(all.total,20);
  const wheel=report(rows,'abs','week',new Date(2026,9,22),'abwheel');
  assert.equal(wheel.rows.length,2);assert.equal(wheel.total,7);assert.equal(wheel.duration,420);
});
