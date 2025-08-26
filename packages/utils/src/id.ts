import md5 from 'md5';
import { v4 as UUIDV4 } from 'uuid';
import { createId } from '@paralleldrive/cuid2';

export enum IDPrefix {
  UID = 'u-',
  EVENT = 'ev-',
  LABEL_CLASS = 'lc-',
  LABEL_INSTANCE = 'li-',
  ACTION_RESULT = 'ar-',
  DOCUMENT = 'd-',
  RESOURCE = 'r-',
  CANVAS = 'c-',
  CANVAS_TEMPLATE = 'ct-',
  REFERENCE = 'rf-',
  TOKEN_USAGE_METER = 'tum-',
  STORAGE_USAGE_METER = 'sum-',
  SKILL = 'sk-',
  SKILL_TRIGGER = 'tr-',
  SKILL_JOB = 'sj-',
  PILOT_SESSION = 'ps-',
  PILOT_STEP = 'pst-',
  WORKFLOW_EXECUTION = 'we-',
  WORKFLOW_NODE_EXECUTION = 'wne-',
  PROVIDER = 'pr-',
  PROVIDER_ITEM = 'pi-',
  TOOLSET = 'ts-',
  CONTENT_SELECTOR = 'cs-',
  MEMO = 'm-',
  VERIFICATION_SESSION = 'vs-',
  IMAGE = 'img-',
  PROJECT = 'p-',
  CODE_ARTIFACT = 'ca-',
  MCP_SERVER = 'mcp-',
  MEDIA_SKILL = 'ms-',
  VIDEO = 'v-',
  AUDIO = 'a-',
  MEDIA_SKILL_RESPONSE = 'msr-',
  CREDIT_RECHARGE = 'cr-',
  CREDIT_USAGE = 'cu-',
  CREDIT_DEBT = 'cd-',
  NODE = 'node-',
  START = 'start-',
  VARIABLE = 'var-',
}

export function genUID(): string {
  return IDPrefix.UID + createId();
}

export function genEventID(): string {
  return IDPrefix.EVENT + createId();
}

export function genLabelClassID(): string {
  return IDPrefix.LABEL_CLASS + createId();
}

export function genLabelInstanceID(): string {
  return IDPrefix.LABEL_INSTANCE + createId();
}

export function genPilotSessionID(): string {
  return IDPrefix.PILOT_SESSION + createId();
}

export function genPilotStepID(): string {
  return IDPrefix.PILOT_STEP + createId();
}

export function genWorkflowExecutionID(): string {
  return IDPrefix.WORKFLOW_EXECUTION + createId();
}

export function genWorkflowNodeExecutionID(): string {
  return IDPrefix.WORKFLOW_NODE_EXECUTION + createId();
}

export function genActionResultID(): string {
  return IDPrefix.ACTION_RESULT + createId();
}

export function genDocumentID(): string {
  return IDPrefix.DOCUMENT + createId();
}

export function genResourceID(): string {
  return IDPrefix.RESOURCE + createId();
}

export function genCodeArtifactID(): string {
  return IDPrefix.CODE_ARTIFACT + createId();
}

export function genCanvasID(): string {
  return IDPrefix.CANVAS + createId();
}

export function genCanvasTemplateID(): string {
  return IDPrefix.CANVAS_TEMPLATE + createId();
}

export function genMemoID(): string {
  return IDPrefix.MEMO + createId();
}

export function genImageID(): string {
  return IDPrefix.IMAGE + createId();
}

export function genVideoID(): string {
  return IDPrefix.VIDEO + createId();
}

export function genAudioID(): string {
  return IDPrefix.AUDIO + createId();
}

export function genMediaSkillResponseID(): string {
  return IDPrefix.MEDIA_SKILL_RESPONSE + createId();
}

export function genReferenceID(): string {
  return IDPrefix.REFERENCE + createId();
}

export function genTokenUsageMeterID(): string {
  return IDPrefix.TOKEN_USAGE_METER + createId();
}

export function genStorageUsageMeterID(): string {
  return IDPrefix.STORAGE_USAGE_METER + createId();
}

export function genProviderID(): string {
  return IDPrefix.PROVIDER + createId();
}

export function genProviderItemID(): string {
  return IDPrefix.PROVIDER_ITEM + createId();
}

export function genToolsetID(): string {
  return IDPrefix.TOOLSET + createId();
}

export function genSkillID(): string {
  return IDPrefix.SKILL + createId();
}

export function genMediaSkillID(): string {
  return IDPrefix.MEDIA_SKILL + createId();
}

export function genSkillTriggerID(): string {
  return IDPrefix.SKILL_TRIGGER + createId();
}

export function genContentSelectorID(): string {
  return IDPrefix.CONTENT_SELECTOR + createId();
}

export function genVerificationSessionID(): string {
  return IDPrefix.VERIFICATION_SESSION + createId();
}

export function genProjectID(): string {
  return IDPrefix.PROJECT + createId();
}

export function genMcpServerID(): string {
  return IDPrefix.MCP_SERVER + createId();
}

export function genVariableID(): string {
  return IDPrefix.VARIABLE + createId();
}

export const genUniqueId = () => {
  const uuid = UUIDV4();
  const timestamp = new Date().getTime();
  const randomString =
    Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const id = `${uuid}${timestamp}${randomString}`;
  return md5(id);
};

export const genTransactionId = () => {
  const timestamp = Date.now();
  return `tx-${timestamp}-${createId()}`;
};

export const genCanvasVersionId = () => {
  const timestamp = Date.now();
  return `cv-${timestamp}-${createId()}`;
};

export const genCreditRechargeId = () => {
  const timestamp = Date.now();
  return `${IDPrefix.CREDIT_RECHARGE}${timestamp}-${createId()}`;
};

export const genCreditUsageId = () => {
  const timestamp = Date.now();
  return `${IDPrefix.CREDIT_USAGE}${timestamp}-${createId()}`;
};

export function genCreditDebtId() {
  const timestamp = Date.now();
  return `${IDPrefix.CREDIT_DEBT}${timestamp}-${createId()}`;
}

export function genStartID(): string {
  return IDPrefix.START + createId();
}

export function genNodeID(): string {
  return IDPrefix.NODE + createId();
}
