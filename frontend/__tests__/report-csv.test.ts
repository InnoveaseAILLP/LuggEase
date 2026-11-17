import {recordsCSV} from '../src/report-csv';
test('exports integer paise as INR and quotes commas/newlines safely',()=>{
  const csv=recordsCSV([{city:'Test, City',amount_paise:10501,note:'a"b\nc'}]);
  expect(csv).toContain('"amount_INR"');expect(csv).toContain('105.01');expect(csv).toContain('"Test, City"');expect(csv).toContain('"a""b\nc"');
});
test.each(['=HYPERLINK("https://untrusted.invalid")','+cmd','-cmd','@SUM(A1)','  =cmd','\tcmd'])('blocks formula injection from %s',value=>{
  expect(recordsCSV([{city:value}])).toContain('"\''+value.replace(/"/g,'""')+'"');
});
test('empty report is explicit and numeric negative amounts remain numeric',()=>{
  expect(recordsCSV([])).toContain('No records');expect(recordsCSV([{amount_paise:-100}])).toContain('"-1"');
});
