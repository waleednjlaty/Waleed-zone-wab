export interface SearchDocument {
  id:number; name:string; arabicName?:string; englishName?:string; aliases?:string[];
  developer?:string|null; category?:string|null; tags?:string[]; description?:string|null;
  packageName?:string; downloads?:number|null;
}
export interface RankedDocument { id:number; score:number; reason:string; }
export interface SearchObservation { query:string; resultCount:number; }
export interface SearchObserver { results(event:SearchObservation):void; clicked?(id:number):void; }
