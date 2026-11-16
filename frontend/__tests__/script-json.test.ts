import {scriptJSON} from '../src/script-json';
test.each(['</script><script>alert(1)</script>','</ScRiPt><!--<img src=x onerror=alert(1)>','< > & \u2028 \u2029','quote " backslash \\ newline\n'])('checkout script serialization preserves data without HTML delimiters: %s',name=>{
 const original={prefill:{name},description:name};const encoded=scriptJSON(original);
 expect(encoded).not.toMatch(/[<>&\u2028\u2029]/);expect(JSON.parse(encoded)).toEqual(original);
});
test('undefined serializes as a valid script JSON value',()=>expect(scriptJSON(undefined)).toBe('null'));
