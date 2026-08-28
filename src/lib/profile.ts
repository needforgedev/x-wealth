/**
 * `USER` stood here — a hardcoded "Raj Bansal / rajbansal@gmail.com / Member
 * since 2021" that `/profile` and `/profile/edit` rendered to whoever was
 * signed in. Removed: the screens take the real `users` row now. A profile
 * showing somebody else's name is worse than a broken link, because nothing
 * about it looks broken.
 */

export type SettingsItem = {
  href: string;
  label: string;
  icon: { src: string; width: number; height: number };
};

/**
 * "Change Password" stood here, pointing at a form for a credential this
 * product does not have — sign-in is phone OTP end to end, and there is no
 * password anywhere in `auth.ts` to change. The row and the page it led to are
 * both gone. A settings entry that opens a working-looking form which can never
 * do anything is a worse defect than a dead link, because the user believes it
 * worked.
 */
export const SETTINGS: ReadonlyArray<SettingsItem> = [
  {
    href: "/profile/edit",
    label: "Account Details",
    icon: { src: "/assets/icon-person.svg", width: 24, height: 24 },
  },
];

/*
 * `FavouriteStock` and `FAVOURITE_STOCKS` stood here: five stocks quoting
 * "$234.00" and "124%" gains against real company logos. They fed
 * `/profile/favourites`, deleted with the distribution surface in W10-15, so
 * nothing has imported them since.
 *
 * They would have to go regardless. `CLAUDE.md` §10 forbids seed data and demo
 * content, and §8.7 forbids platform-authored performance figures — a fabricated
 * 124% gain shown beside a real ticker is both. The performance-claims lint rule
 * cannot see it, because it reads words and this was numbers.
 */
