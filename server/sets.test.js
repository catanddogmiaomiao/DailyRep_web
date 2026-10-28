import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRecord} from './domain.js';
import {report} from '../src/stats.js';
import {recordUnit,formatSets} from '../src/subtypes.js';

test('muscle details preserve every set and compute reps rather than trusting entered totals',()=>{
  const record=validateRecord({sport:'abs',occurredAt:'2026-10-20',details:[
    {subtype:'situps',sets:[20,20,15],value:999,duration:600},
    {subtype:'abwheel',sets:[10,10,8],duration:300},
  ]});
  assert.equal(record.value,83);assert.equal(record.details[0].value,55);assert.equal(record.duration,900);
  assert.equal(record.quantityUnit,'reps');assert.equal(recordUnit(record),'个');
  assert.deepEqual(record.details[0].sets,[20,20,15]);
  assert.equal(formatSets(record.details[0].sets),'第1组 20个 · 第2组 20个 · 第3组 15个');
  const pushups=validateRecord({sport:'pushups',occurredAt:'2026-10-20',details:[{subtype:null,sets:[20,15,10],duration:300}]});
  assert.equal(pushups.value,45);assert.deepEqual(pushups.details[0].sets,[20,15,10]);
});

test('sets reject zero, fractional, missing, excessive, and inconsistent units',()=>{
  const base={sport:'abs',occurredAt:'2026-10-20'};
  for(const sets of [[],[0],[-1],[1.5],['20'],[null],Array(101).fill(1),[100000,1]]) {
    assert.throws(()=>validateRecord({...base,details:[{subtype:'situps',sets,duration:60}]}));
  }
  assert.throws(()=>validateRecord({...base,details:[{subtype:'situps',sets:[20],duration:60},{subtype:'abwheel',value:10,duration:60}]}));
  assert.throws(()=>validateRecord({sport:'swimming',occurredAt:'2026-10-20',details:[{subtype:'freestyle',sets:[20],duration:60}]}));
  const legacy=validateRecord({...base,value:10,duration:600,quantityUnit:'reps'});
  assert.equal(legacy.quantityUnit,'minutes','old total-only input is not reinterpreted as reps');
  assert.equal(recordUnit(legacy),'分钟');
});

test('new repetition records and old minute records never mix volume units',()=>{
  const date=new Date(2026,9,20,10).toISOString();
  const rows=[
    {sport:'abs',quantityUnit:'reps',value:83,duration:900,occurredAt:date,details:[{subtype:'situps',sets:[20,20,15],value:55,duration:600},{subtype:'abwheel',sets:[10,10,8],value:28,duration:300}]},
    {sport:'abs',subtype:'situps',value:10,duration:600,occurredAt:date},
  ];
  for(const period of ['week','month','year']) {
    const all=report(rows,'abs',period,new Date(2026,9,22));
    assert.equal(all.rows.length,2);assert.equal(all.setCount,6);assert.equal(all.total,83);assert.equal(all.duration,1500);assert.equal(all.legacyCount,1);
    assert.equal(all.bars.reduce((sum,b)=>sum+b.value,0),83);
    const situps=report(rows,'abs',period,new Date(2026,9,22),'situps');
    assert.equal(situps.total,55);assert.equal(situps.setCount,3);assert.equal(situps.duration,1200);
    assert.equal(situps.rows.length,2);assert.equal(situps.legacyCount,1);
  }
});
