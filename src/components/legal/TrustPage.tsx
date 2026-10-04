import Link from 'next/link';
export default function TrustPage({title,children}:{title:string;children:React.ReactNode}){
  return <article className="shell trust-page"><Link className="view-all" href="/">Waleed Zone — الرئيسية ←</Link><h1>{title}</h1><div className="trust-page-content">{children}</div></article>;
}
