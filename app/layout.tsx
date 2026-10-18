import './globals.css';import type {Metadata} from 'next';import {BrandLogo} from '@/components/BrandLogo';
export const metadata:Metadata={title:'PLP Chapter Gisenyi',description:'Website and management system',icons:{icon:'/plp-gisenyi-icon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><nav className="p-4 border-b"><BrandLogo/></nav>{children}<footer className="p-6 bg-slate-900 text-white"><BrandLogo dark/></footer></body></html>}
