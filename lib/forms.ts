import layoutJson from "@/data/forms/layout-geometry.json";
import designJson from "@/data/forms/design-checklist.json";
import { questionnaireTemplateSchema, type QuestionnaireTemplate } from "@/lib/questionnaire/template";

/** Structured input forms that feed the rule engine (same template format as the questionnaire). */
export const LAYOUT_GEOMETRY_FORM: QuestionnaireTemplate = questionnaireTemplateSchema.parse(layoutJson);
export const DESIGN_CHECKLIST_FORM: QuestionnaireTemplate = questionnaireTemplateSchema.parse(designJson);
