export type GoalDefinitionType = 'page_visit' | 'event_count';

export interface GoalDefinition {
    id: string;
    propertyId: string;
    name: string;
    description?: string | null;
    type: GoalDefinitionType;
    target: string;
    isActive: boolean;
    createdAt?: string | null;
    updatedAt?: string | null;
}

export interface FunnelDefinition {
    id: string;
    propertyId: string;
    name: string;
    description?: string | null;
    steps: string[];
    isActive: boolean;
    createdAt?: string | null;
    updatedAt?: string | null;
}

export interface GoalSuggestion {
    name: string;
    description: string;
    type: GoalDefinitionType;
    target: string;
}

export interface FunnelSuggestion {
    name: string;
    description: string;
    steps: string[];
}
