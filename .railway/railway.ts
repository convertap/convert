import { defineRailway, github, project, service } from "railway/iac";

export default defineRailway(() => {
  const web = service("web", {
    source: github("convertap/convert"),
    build: "pnpm run build",
  });

  return project("project", {
    resources: [web],
  });
});
