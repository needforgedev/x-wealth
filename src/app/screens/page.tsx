import Link from "next/link";

type ScreenLink = {
  href: string;
  title: string;
  node: string;
  note?: string;
};

type ScreenGroup = {
  heading: string;
  screens: ScreenLink[];
};

const GROUPS: ScreenGroup[] = [
  {
    heading: "Auth & onboarding",
    screens: [
      { href: "/", title: "Get Started", node: "0:3 / 4:10828", note: "Investor + Advisor tabs" },
      { href: "/otp", title: "OTP", node: "4:11104" },
      { href: "/complete-profile", title: "Complete Profile", node: "4:11396" },
      { href: "/onboarding-questions", title: "Onboarding Questions", node: "4:11533" },
      { href: "/choose-interests", title: "Choose Interests", node: "4:11677" },
      { href: "/group-invitations", title: "Group Invitations", node: "17:5010" },
    ],
  },
  {
    heading: "Main app",
    screens: [
      { href: "/chats", title: "Chats", node: "4:11923" },
      { href: "/signals", title: "All Signals", node: "11:540" },
      { href: "/portfolio", title: "My Portfolio", node: "11:1107" },
      { href: "/portfolio/groups", title: "Portfolio by Group", node: "742:1317" },
      { href: "/portfolio/add", title: "Add to Portfolio", node: "806:1109 / 17:4082" },
    ],
  },
  {
    heading: "Groups",
    screens: [
      {
        href: "/groups/traders-heaven",
        title: "Group Chat View",
        node: "14:1644",
        note: "Artboard only — the working member view is /investor/groups/[id]",
      },
      { href: "/groups/traders-heaven/thread", title: "Group Threads View", node: "15:3321" },
      { href: "/groups/traders-heaven/profile", title: "Group Profile View", node: "14:2127" },
      { href: "/groups/traders-heaven/payment", title: "Group Payment View", node: "15:2754" },
      { href: "/groups/traders-heaven/payment/success", title: "Payment Successful", node: "15:2993" },
      { href: "/groups/traders-heaven/add-stock", title: "Add Stock from Chat", node: "17:4495" },
    ],
  },
  {
    heading: "Discovery & accounts",
    screens: [
      {
        href: "/discover",
        title: "Group Discovery",
        node: "15:3520",
        note: "Artboard only — the working browse-and-join screen is /investor/discover",
      },
      { href: "/discover/dimmed", title: "Group Discovery (dimmed)", node: "1788:2694", note: "Scrim only — the sheet it sat behind was never drawn" },
      { href: "/account/switch", title: "Switch Account", node: "1788:1381" },
      { href: "/account/choose", title: "Choose Account", node: "1788:1645" },
    ],
  },
  {
    heading: "Profile",
    screens: [
      { href: "/profile", title: "Profile", node: "742:1653" },
      { href: "/profile/edit", title: "Edit Profile", node: "807:1783" },
      { href: "/profile/password", title: "Change Password", node: "807:1585" },
      { href: "/profile/logout", title: "Logout Confirmation", node: "807:1966" },
      { href: "/profile/favourites", title: "Favourite Stocks", node: "808:1356" },
    ],
  },
];

/**
 * The Advisor page of the Figma file. Its Get Started, OTP and Complete Profile
 * artboards are drawn identically to the Investor ones, so those three routes
 * render the same screen bodies with advisor destinations.
 */
const ADVISOR_GROUPS: ScreenGroup[] = [
  {
    heading: "Advisor — onboarding",
    screens: [
      { href: "/advisor/otp", title: "OTP", node: "Advisor / OTP Screen", note: "Shared artboard" },
      {
        href: "/advisor/complete-profile",
        title: "Complete Profile",
        node: "Advisor / Complete Profile",
        note: "Shared artboard",
      },
      { href: "/advisor/kyc", title: "Complete KYC", node: "Advisor / Complete Profile (1031)" },
      {
        href: "/advisor/create-group",
        title: "Create Group",
        node: "Advisor / Complete Profile (1050)",
        note: "Artboard only — the working form is /advisor/groups/new",
      },
      { href: "/advisor/pricing", title: "Pricing Tiers", node: "Advisor / Complete Profile (715)" },
    ],
  },
  {
    heading: "Advisor — main app",
    screens: [
      { href: "/advisor/chats", title: "Chats", node: "Advisor / Chats Screen" },
      { href: "/advisor/signals", title: "All Signals", node: "Advisor / All Signals" },
    ],
  },
  {
    heading: "Advisor — groups",
    screens: [
      {
        href: "/advisor/groups/traders-heaven",
        title: "Group Chat View",
        node: "Advisor / Group Chat View",
        note: "Artboard only — the working screen is /advisor/groups/[id]/manage",
      },
      {
        href: "/advisor/groups/traders-heaven/members",
        title: "All Members",
        node: "Advisor / Group Chat View (roster)",
      },
      {
        href: "/advisor/groups/traders-heaven/profile",
        title: "Group Profile View",
        node: "Advisor / Group Profile View",
      },
      {
        href: "/advisor/groups/traders-heaven/edit",
        title: "Edit Group Info",
        node: "Advisor / Edit Group Info + Edit Group Info 2",
      },
    ],
  },
];

/**
 * The Alpha page of the Figma file — a second pass at onboarding and home that
 * neither of the other two pages carries. Built on its own routes so the
 * Investor and Advisor screens stay exactly as drawn; re-point the links if
 * Alpha is adopted as the live flow.
 */
const ALPHA_GROUPS: ScreenGroup[] = [
  {
    heading: "Alpha — auth & onboarding",
    screens: [
      {
        href: "/alpha",
        title: "Login",
        node: "Alpha / Login",
        note: "Advisor login — phone plus Continue with Google",
      },
      {
        href: "/alpha/google",
        title: "Google",
        node: "Alpha / Google",
        note: "Artboard is a flat screenshot of the OAuth chooser; this is a stand-in",
      },
      { href: "/alpha/verify-number", title: "Verify Number", node: "Alpha / OTP Screen (2125:1776)" },
      { href: "/alpha/otp", title: "Enter OTP", node: "Alpha / OTP Screen (2103:1871)" },
      {
        href: "/alpha/complete-profile",
        title: "Complete Profile",
        node: "Alpha / Auto-fill",
      },
      {
        href: "/alpha/onboarding-questions",
        title: "Onboarding Questions",
        node: "Alpha / Onboarding Questions",
        note: "Experience and interests on one step",
      },
      { href: "/alpha/join-groups", title: "Join Groups", node: "Alpha / Join Groups" },
    ],
  },
  {
    heading: "Alpha — home",
    screens: [
      {
        href: "/alpha/chats",
        title: "Chats",
        node: "Alpha / Chats Screen (2103:2481)",
        note: "Account header with avatar, switch badge and bell",
      },
      {
        href: "/alpha/home",
        title: "Home + market strip",
        node: "Alpha / Chats Screen (2133:1778)",
      },
      {
        href: "/alpha/home/loading-cards",
        title: "Home (signals loading, rail)",
        node: "Alpha / Chats Screen (2134:2281)",
      },
      {
        href: "/alpha/home/loading-list",
        title: "Home (signals loading, list)",
        node: "Alpha / Chats Screen (2133:2070)",
      },
      {
        href: "/alpha/home/empty",
        title: "Home (no groups)",
        node: "Alpha / Chats Screen (2134:2424)",
      },
    ],
  },
  {
    heading: "Alpha — groups & discovery",
    screens: [
      {
        href: "/alpha/groups/traders-heaven",
        title: "Group Chat View",
        node: "Alpha / Group Chat View (2103:2703)",
      },
      {
        href: "/alpha/groups/traders-heaven/tinted",
        title: "Group Chat View (tinted)",
        node: "Alpha / Group Chat View (2105:1667)",
      },
      {
        href: "/alpha/discover",
        title: "Group Discovery",
        node: "Alpha / Group Discoery (2105:1827)",
      },
      {
        href: "/alpha/discover/stats",
        title: "Group Discovery (stat cards)",
        node: "Alpha / Group Discoery (2105:2112)",
      },
    ],
  },
];

const ALL_GROUPS = [...GROUPS, ...ADVISOR_GROUPS, ...ALPHA_GROUPS];
const TOTAL = ALL_GROUPS.reduce((n, g) => n + g.screens.length, 0);

/** Dev-only index so every built screen is one tap away during review. */
export default function ScreensIndexPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-app bg-surface px-6 py-10">
      <h1 className="text-[20px] font-semibold text-ink">X Wealth — Screens</h1>
      <p className="mt-2 text-[14px] text-muted">
        All {TOTAL} screens from the Investor, Advisor and Alpha pages of the Figma file. Node ids
        and artboard names are shown for cross-referencing.
      </p>

      {ALL_GROUPS.map((group) => (
        <section key={group.heading} className="mt-8">
          <h2 className="text-[13px] font-semibold uppercase text-muted">{group.heading}</h2>
          <ul className="mt-3 flex flex-col gap-px overflow-hidden rounded-[4px] border border-line">
            {group.screens.map((screen) => (
              <li key={screen.href}>
                <Link
                  href={screen.href}
                  className="flex items-baseline gap-3 bg-surface px-4 py-3 hover:bg-surface-alt"
                >
                  <span className="text-[15px] font-medium text-ink">{screen.title}</span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted">
                    {screen.node}
                  </span>
                </Link>
                {screen.note && (
                  <p className="bg-surface px-4 pb-3 text-[12px] text-muted">{screen.note}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
