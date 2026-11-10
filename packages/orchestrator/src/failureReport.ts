const STAGE_HE: Record<string, string> = {
  brief: "בריף",
  script: "תסריט",
  audio: "קול",
  asset: "תמונות וסצנות",
  package: "אריזה",
  render: "סרטון",
  series: "סדרה"
};

export type FailureStageRow = {
  stage: string;
  status: string;
  error: string | null;
};

export function describeProductionFailure(input: {
  runId: string;
  title: string;
  userEmail: string | null;
  userName: string | null;
  stage: string | null;
  stages: FailureStageRow[];
  language?: string | null;
  freeVideoGranted: boolean;
}): { subject: string; text: string } {
  const failed = input.stages.filter((stage) => stage.status === "FAILED");
  const unfinished = input.stages.filter((stage) => stage.status !== "COMPLETED" && stage.status !== "FAILED");
  const stageLabel = (stage: string) => STAGE_HE[stage] ?? stage;
  const lines = [
    `הפקה נכשלה לפני שהמשתמש קיבל סרטון תקין.`,
    ``,
    `סרטון: ${input.title || "(ללא כותרת)"}`,
    `מזהה: ${input.runId}`,
    `קישור: https://reelmino.com/runs/${input.runId}`,
    `משתמש: ${input.userName || "—"} <${input.userEmail || "ללא מייל"}>`,
    `שפה: ${input.language || "—"}`,
    `שלב שנעצר: ${input.stage ? stageLabel(input.stage) : "—"}`,
    `סרטון חינם נוסף: ${input.freeVideoGranted ? "כן" : "לא"}`,
    ``,
    `מה היה חסר:`,
    failed.length
      ? failed
          .map((stage) => `- ${stageLabel(stage.stage)} נכשל: ${(stage.error || "בלי פירוט").slice(0, 1500)}`)
          .join("\n")
      : "- אין קובץ סרטון סופי. ההפקה נעצרה לפני השלמה.",
    unfinished.length ? `- שלבים שלא הושלמו: ${unfinished.map((stage) => stageLabel(stage.stage)).join(", ")}` : "",
    ``,
    `מצב כל שלב:`,
    ...input.stages.map(
      (stage) => `- ${stageLabel(stage.stage)}: ${stage.status}${stage.error ? ` — ${stage.error.slice(0, 400)}` : ""}`
    )
  ];
  return {
    subject: `תקלה בהפקה: ${input.title || input.runId}`,
    text: lines.filter((line) => line !== "").join("\n")
  };
}
