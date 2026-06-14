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

export const getLevelWidth = (level: string): string => {
  switch (level) {
    case "expert":
      return "w-full";
    case "advanced":
      return "w-3/4";
    default:
      return "w-1/2";
  }
};

export const getLevelColor = (level: string): string => {
  switch (level) {
    case "expert":
      return "bg-primary-500";
    case "advanced":
      return "bg-accent-500";
    default:
      return "bg-slate-400";
  }
};
