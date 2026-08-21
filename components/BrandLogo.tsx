import Image from 'next/image';
export function BrandLogo({dark=false}:{dark?:boolean}){const src=dark?'/plp-gisenyi-logo-white.svg':'/plp-gisenyi-logo.svg';return <div className="flex items-center gap-3"><Image src={src} alt="PLP Chapter Gisenyi logo" width={48} height={48} priority/><span className="font-bold">PLP Chapter Gisenyi</span></div>}
