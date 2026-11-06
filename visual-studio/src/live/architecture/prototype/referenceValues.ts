/** Content corrections only; retain every supplied component, field, layout and interaction. */
export function referenceValues<T>(value:T):T{
 const pairs=[['0.12','0.1270'],['0.44','0.4658'],['0.08','0.0847'],['0.71','0.7517'],['0.21','0.2223'],['0.36','0.3811']];
 let json=JSON.stringify(value);
 for(const [before,after] of pairs)json=json.replace(new RegExp('(?<![\\d.])'+before.replace('.','\\.')+'(?!\\d)','g'),after);
 json=json.replace(/(?<![\d.])2\.00?(?!\d)/g,'1.8891').replaceAll('Length: 40 chars','Length: 39 chars');
 return JSON.parse(json) as T;
}
