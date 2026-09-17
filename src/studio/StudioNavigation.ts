export type StudioPage = "home" | "editor" | "skills" | "catalog";
export type SkillsOrigin = "home" | "editor";
export interface StudioLocation {
  page: StudioPage;
  skillsOrigin: SkillsOrigin;
}

export function readStudioLocation(): StudioLocation {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  return {
    page: view === "design" ? "editor" : view === "skills" || view === "catalog" ? view : "home",
    skillsOrigin: params.get("skillsFrom") === "design" ? "editor" : "home",
  };
}

export function pushStudioLocation(page: StudioPage, skillsOrigin: SkillsOrigin = "home") {
  const url = new URL(window.location.href);
  if (page === "home") url.searchParams.delete("view");
  else url.searchParams.set("view", page === "editor" ? "design" : page);
  if (page === "skills" && skillsOrigin === "editor") url.searchParams.set("skillsFrom", "design");
  else url.searchParams.delete("skillsFrom");
  // Preserve subdirectory hosting, unrelated parameters and the fragment.
  if (url.href !== window.location.href) window.history.pushState(null, "", url);
}
