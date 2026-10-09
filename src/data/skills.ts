export const skills = {
  languages: [
    { name: "Java", level: "expert" },
    { name: "SQL", level: "expert" },
    { name: "TypeScript", level: "advanced" },
    { name: "Python", level: "intermediate" },
  ],
  frameworks: [
    { name: "Spring Framework", level: "expert" },
    { name: "Quarkus", level: "expert" },
    { name: "Jakarta EE", level: "expert" },
    { name: "JAX-RS", level: "advanced" },
  ],
  platform: [
    { name: "Kubernetes", level: "expert" },
    { name: "PostgreSQL", level: "expert" },
    { name: "Docker", level: "advanced" },
    { name: "HashiCorp Vault", level: "advanced" },
  ],
  tools: [
    { name: "Pulumi / Helm", level: "expert" },
    { name: "GitLab CI/CD", level: "expert" },
    { name: "SonarQube / Qodana", level: "advanced" },
    { name: "Liquibase", level: "advanced" },
  ],
};

export type SkillLevel = "expert" | "advanced" | "intermediate";

// "expert" means daily use; everything else is something I've shipped with.
export const splitByUse = (list: { name: string; level: string }[]) => ({
  daily: list.filter((s) => s.level === "expert"),
  shipped: list.filter((s) => s.level !== "expert"),
});
