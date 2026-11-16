/** Serialize data for an inline script without introducing HTML markup or JS separators. */
export function scriptJSON(value:unknown):string{
 return (JSON.stringify(value)??'null').replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
}
