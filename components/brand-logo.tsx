import Image from "next/image";

export function BrandLogo({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return <Image src="/biology-investigations-logo.png" alt="Innovations in Biology Investigations"
    width={584} height={214} priority={priority} unoptimized className={`h-auto ${className}`} />;
}
