export const KIND_LABEL: Record<string, string> = { waiver: "Waiver", form: "Form", policy: "Policy / agreement", upload: "Document upload" };
export const ENFORCEMENT_LABEL: Record<string, string> = {
  blocks_booking: "Required to book",
  before_attendance: "Required before attending",
  informational: "Informational",
};
export const FREQUENCY_LABEL: Record<string, string> = { once: "Once", periodic: "Renewed periodically", per_booking: "For each booking" };
export const SCOPE_LABEL: Record<string, string> = {
  all: "Every family",
  program: "Families booking a program",
  membership: "Club Yalla members",
  family: "One family",
  child: "One child",
  session: "A specific event/session",
};

export const LEGAL_NOTE =
  "Yalla must supply reviewed language for waivers and agreements. The built-in signature is a typed-name e-signature with explicit consent, recorded with the exact version, signer, relationship, time and device details. It is a workflow, not a guarantee of legal enforceability — connect a dedicated signature provider if your counsel requires one.";
