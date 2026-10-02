import DetailPage from '@/components/details/DetailPage';
import { detailMetadata } from '@/lib/catalog/seo';
export const dynamic='force-dynamic';
interface Props {params:Promise<{slug:string}>;}
export async function generateMetadata({params}:Props) {return detailMetadata((await params).slug,'apps');}
export default async function Page({params}:Props) {return <DetailPage slug={(await params).slug} kind="apps"/>;}
