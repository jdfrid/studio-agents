import type { Agent, StageName } from "@studio/shared";

const registry = new Map<StageName, Agent<unknown, unknown>>();

export function registerAgent<I, O>(agent: Agent<I, O>): void {
  registry.set(agent.name, agent as unknown as Agent<unknown, unknown>);
}

export function getAgent(stage: StageName): Agent<unknown, unknown> | undefined {
  return registry.get(stage);
}

export function getRegisteredStages(): StageName[] {
  return [...registry.keys()];
}
