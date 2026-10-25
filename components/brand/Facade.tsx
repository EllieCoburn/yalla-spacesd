import Image from "next/image";
import { Mark } from "./Mark";

/**
 * The logo, rebuilt in photographs: the tower with its scalloped parapet,
 * the arched doorway, the round window and the palm — each holding a real
 * moment from Yalla.
 */
export function Facade({
  tower,
  door,
  porthole,
  className = "",
}: {
  tower: { src: string; alt: string };
  door: { src: string; alt: string };
  porthole: { src: string; alt: string };
  className?: string;
}) {
  return (
    <div className={`relative aspect-[5/6] w-full ${className}`}>
      {/* Tower */}
      <div className="absolute top-[7%] left-[16%] h-[80%] w-[52%]">
        <Mark name="roofline" className="absolute -top-[5.5%] left-[-4%] w-[108%] text-blue" />
        <div className="relative h-full w-full overflow-hidden bg-sand">
          <Image src={tower.src} alt={tower.alt} fill priority sizes="(min-width:1024px) 26vw, 50vw" className="object-cover" />
        </div>
      </div>

      {/* Porthole / sun */}
      <div className="absolute top-[3%] right-[12%] aspect-square w-[17%] overflow-hidden rounded-full bg-sand ring-[6px] ring-chalk">
        <Image src={porthole.src} alt={porthole.alt} fill sizes="12vw" className="object-cover" />
      </div>

      {/* Palm */}
      <Mark name="palm" className="absolute right-[2%] bottom-[8%] h-[72%] w-auto text-blue" />

      {/* Doorway */}
      <div className="absolute bottom-[4%] left-0 h-[46%] w-[30%] overflow-hidden rounded-t-[999px] bg-sand ring-[6px] ring-chalk">
        <Image src={door.src} alt={door.alt} fill sizes="(min-width:1024px) 15vw, 30vw" className="object-cover" />
      </div>

      {/* Horizon — the long hand-drawn baseline of the logo */}
      <svg viewBox="0 0 600 20" className="absolute bottom-[5.5%] left-[24%] w-[76%] text-blue" aria-hidden preserveAspectRatio="none">
        <path d="M4 14 C 120 9, 260 12, 380 8 S 540 5, 596 4" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      </svg>
    </div>
  );
}
