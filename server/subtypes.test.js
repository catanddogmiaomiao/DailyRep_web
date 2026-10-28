import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {validateRecord} from './domain.js';
import {report} from '../src/stats.js';
import {subtypeOptions} from '../src/subtypes.js';

test('all five subtypes round-trip validation; cross-sport and invented types fail', () => {
  const base = {value: 100, duration: 120, occurredAt: '2026-10-01T10:00:00Z'};
  for (const sport of ['swimming','abs']) {
    for (const subtype of subtypeOptions(sport)) assert.equal(validateRecord({...base,sport,subtype:subtype.value}).subtype,subtype.value);
  }
  for (const [sport,subtype] of [['swimming','situps'],['abs','freestyle'],['running','freestyle'],['swimming','unknown']]) {
    assert.throws(() => validateRecord({...base,sport,subtype}), /运动类型/);
  }
  assert.equal(validateRecord({...base,sport:'swimming'}).subtype,null,'old installed clients remain compatible');
});

test('week, month and year filter volume, duration, bars and records by subtype without reclassifying legacy data', () => {
  for (const sport of ['swimming','abs']) {
    const [first,second] = subtypeOptions(sport);
    const time = new Date(2026,9,20,10).toISOString();
    const rows = [
      {sport,subtype:first.value,value:100,duration:120,occurredAt:time},
      {sport,subtype:second.value,value:200,duration:240,occurredAt:time},
      {sport,value:50,duration:60,occurredAt:time},
      {sport,subtype:first.value,value:999,duration:999,occurredAt:new Date(2025,0,1).toISOString()},
      {sport:'running',value:9,duration:10,occurredAt:time},
    ];
    for (const period of ['week','month','year']) {
      const all = report(rows,sport,period,new Date(2026,9,22));
      assert.equal(all.total,350); assert.equal(all.duration,420);
      assert.equal(all.breakdown.reduce((sum,g) => sum+g.total,0),350);
      const selected = report(rows,sport,period,new Date(2026,9,22),first.value);
      assert.equal(selected.total,100); assert.equal(selected.duration,120); assert.equal(selected.rows.length,1);
      assert.equal(selected.bars.reduce((sum,b) => sum+b.value,0),100);
      const legacy = report(rows,sport,period,new Date(2026,9,22),'unclassified');
      assert.equal(legacy.total,50); assert.equal(legacy.rows.length,1);
      assert.equal(report([],sport,period,new Date(2026,9,22),second.value).total,0);
    }
  }
});

test('additive database migration preserves an existing record and leaves its subtype unclassified', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
    db.exec("INSERT INTO records VALUES ('old','swimming',500,600,'2026-10-01',NULL)");
    db.exec(readFileSync(new URL('../migrations/0002_record_subtype.sql',import.meta.url),'utf8'));
    db.exec(readFileSync(new URL('../migrations/0003_record_details.sql',import.meta.url),'utf8'));
    const record = db.prepare('SELECT * FROM records').get();
    assert.equal(record.details,null);
    assert.equal(record.value,500); assert.equal(record.duration,600); assert.equal(record.subtype,null);
  } finally {db.close();}
});
