"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import type { Badges, User, Workspace } from "@/lib/data/types";

type WorkspaceValue = {
  user: User;
  workspace: Workspace;
  badges: Badges;
  /** Re-read the rail counts after an action that could change one. */
  refreshBadges: () => void;
};

const Ctx = createContext<WorkspaceValue | null>(null);

/**
 * Who is signed in, which workspace they are in, and the counts on the rail.
 *
 * The user and workspace come from the server on the layout, so no screen has
 * to fetch them. The badges are re-read on every navigation: a layout does not
 * re-render between pages, and a count taken at sign-in goes stale the moment
 * someone clears a task.
 */
export function WorkspaceProvider({
  user,
  workspace,
  children,
}: {
  user: User;
  workspace: Workspace;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [badges, setBadges] = useState<Badges>({ tasks: 0, inbox: 0, config: 0 });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    api
      .badges()
      .then((next) => live && setBadges(next))
      .catch(() => undefined); // A missing count is better than a broken rail.
    return () => {
      live = false;
    };
  }, [pathname, nonce]);

  const refreshBadges = useCallback(() => setNonce((n) => n + 1), []);
  const value = useMemo(
    () => ({ user, workspace, badges, refreshBadges }),
    [user, workspace, badges, refreshBadges],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useWorkspace must be used inside the dashboard shell");
  return value;
}
