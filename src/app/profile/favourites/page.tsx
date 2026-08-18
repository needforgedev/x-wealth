import Image from "next/image";

import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { ProfileIdentity } from "@/components/screens/ProfileIdentity";
import { TopBar } from "@/components/TopBar";
import { MaskIcon } from "@/components/ui/MaskIcon";
import { FAVOURITE_STOCKS } from "@/lib/profile";

/** Profile with the Favourite Stocks card (808:1356). */
export default function FavouriteStocksPage() {
  return (
    <AppShell className="bg-surface-alt">
      <TopBar />

      <section className="shrink-0 bg-surface pt-[20px] pb-[24px]">
        <ProfileIdentity />
        <p className="mt-[20px] px-[27px] text-[13px] font-semibold text-brand">View Profile</p>
      </section>

      <section className="mx-[26px] mt-[27px] mb-[26px] rounded-[12px] bg-surface px-[13px] pt-[16px] pb-[20px]">
        <h2 className="px-[6px] text-[12px] font-semibold uppercase text-stock-muted/[0.69]">
          Favourite Stocks
        </h2>

        <ul className="mt-[16px] flex flex-col gap-[32px]">
          {FAVOURITE_STOCKS.map((stock) => (
            <li key={stock.id} className="flex items-center">
              <span className="flex w-[46px] shrink-0 items-center justify-center">
                <Image
                  src={stock.logo}
                  alt=""
                  width={stock.logoWidth}
                  height={stock.logoHeight}
                  className="max-h-[25px] w-auto object-contain"
                />
              </span>

              <div className="ml-[13px] min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-stock-ink">{stock.ticker}</p>
                <p className="mt-[4px] truncate text-[12px] text-stock-muted">{stock.name}</p>
              </div>

              <div className="ml-3 shrink-0 text-right">
                <p className="text-[14px] font-semibold text-stock-muted">{stock.price}</p>
                <p
                  className={`mt-[5px] flex items-center justify-end gap-[8px] ${
                    stock.direction === "up" ? "text-up" : "text-down"
                  }`}
                >
                  <MaskIcon
                    src="/assets/icon-arrow-drop-up.svg"
                    width={11.67}
                    height={5.83}
                    className={stock.direction === "down" ? "rotate-180" : ""}
                  />
                  <span className="text-[11px] font-bold">{stock.change}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex-1" />
      <BottomNav />
    </AppShell>
  );
}
