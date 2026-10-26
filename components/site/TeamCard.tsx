import Image from "next/image";
import { cohortMarks } from "@/components/brand/CohortMarks";
import { Mark } from "@/components/brand/Mark";
import type { MarkName } from "@/components/brand/marks";
import type { TeamGroup, TeamMember } from "@/content/team";

const LEADER_MARKS: MarkName[] = ["arch", "dotsun", "window", "sprig", "palm"];

/** Arched portrait frame. Until a photo is added it shows a hand-drawn mark in Yalla blue. */
export function TeamCard({ member, cohort, index }: { member: TeamMember; cohort?: TeamGroup["cohort"]; index: number }) {
  const Illustration = cohort ? cohortMarks[cohort] : null;
  return (
    <article>
      <div className="relative flex aspect-[3/4] items-end justify-center overflow-hidden rounded-t-[999px] bg-mist">
        {member.photo ? (
          <Image src={member.photo} alt={`${member.name}, ${member.role}`} fill sizes="(min-width:1024px) 22vw, 45vw" className="object-cover" />
        ) : Illustration ? (
          <Illustration className="mb-[6%] w-[78%] text-blue/70" />
        ) : (
          <Mark name={LEADER_MARKS[index % LEADER_MARKS.length]} className="mb-[14%] h-[34%] w-auto text-blue/55" />
        )}
      </div>
      <h3 className="display mt-5 text-[1.35rem] sm:text-[1.5rem]">{member.name}</h3>
      <p className="eyebrow mt-1.5 text-[0.6rem] text-ink-soft">{member.role}</p>
      {member.bio ? <p className="mt-3 text-[0.95rem] text-ink-soft">{member.bio}</p> : null}
    </article>
  );
}
