import type { LabResource } from '../../types';
import { serviceForResource } from './catalog';

export type SimulatedResourceState =
    'running' | 'stopped' | 'enabled' | 'disabled' | 'logging' | 'logging-stopped';
export type SimulatedResourceStates = Record<string, SimulatedResourceState>;

export function lifecycleOptions(
    resource: LabResource,
): [SimulatedResourceState, SimulatedResourceState] | null {
    const service = serviceForResource(resource);
    if (service === 'ec2' || service === 'aurora') return ['running', 'stopped'];
    if (service === 'cloudfront') return ['enabled', 'disabled'];
    if (service === 'cloudTrail') return ['logging', 'logging-stopped'];
    return null;
}

export function initialState(resource: LabResource): SimulatedResourceState | null {
    const options = lifecycleOptions(resource);
    if (!options) return null;
    if (resource.type === 'cloudFrontDistribution') return resource.enabled ? 'enabled' : 'disabled';
    if (resource.type === 'awsResource' && serviceForResource(resource) === 'cloudfront') {
        return resource.settings.Enabled === false ? 'disabled' : 'enabled';
    }
    if (resource.type === 'awsResource' && serviceForResource(resource) === 'cloudTrail') {
        return resource.settings.IsLogging === false ? 'logging-stopped' : 'logging';
    }
    return options[0];
}

export function resourceState(
    resource: LabResource,
    states: SimulatedResourceStates,
): SimulatedResourceState | null {
    return states[resource.id] ?? initialState(resource);
}

export function stateLabel(resource: LabResource, states: SimulatedResourceStates): string {
    const state = resourceState(resource, states);
    if (state === 'logging-stopped') return 'Logging stopped';
    if (state) return state[0].toUpperCase() + state.slice(1);
    return 'Configured';
}

export function activeStateCount(resources: LabResource[], states: SimulatedResourceStates): number {
    return resources.filter((resource) =>
        ['running', 'enabled', 'logging'].includes(resourceState(resource, states) ?? ''),
    ).length;
}
