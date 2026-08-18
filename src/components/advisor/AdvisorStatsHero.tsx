import { ADVISOR, ADVISOR_STATS } from "@/lib/advisor";

/**
 * Dark performance panel under the brand bar on the advisor Chats screen. On
 * the artboard the navy rectangle runs from y=0 to y=245 with the brand bar
 * painted over its first 60px, so what remains below the bar is 185px tall.
 */
export function AdvisorStatsHero() {
  return (
    <section className="shrink-0 bg-advisor-hero px-[25px] pt-[30px] pb-[27px]">
      <div className="flex items-start">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[19px] font-semibold capitalize text-white">
            Welcome {ADVISOR.firstName}
          </p>
          <p className="mt-[5px] truncate text-[16px] text-white/70">{ADVISOR.subtitle}</p>
        </div>

        <span className="ml-4 flex size-[49px] shrink-0 items-center justify-center rounded-full bg-[#cad6ff]/[0.72] text-[16px] font-medium text-avatar-ink">
          {ADVISOR.initials}
        </span>
      </div>

      <div className="mt-[22px] h-px bg-white/[0.14]" />

      <dl className="mt-[22px] flex">
        {ADVISOR_STATS.map((stat) => (
          <div key={stat.label} className="flex-1">
            <dd className="text-[17px] font-bold text-white">{stat.value}</dd>
            <dt className="mt-[4px] text-[15px] text-white/[0.58]">{stat.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
