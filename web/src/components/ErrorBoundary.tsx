'use client';

import { Component, type ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onReset?: () => void;
    title?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        this.props.onReset?.();
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <EmptyState
                    icon={AlertCircle}
                    title={this.props.title || 'Something went wrong'}
                    description={this.state.error?.message || 'An unexpected error occurred. Please try again.'}
                    actions={<Button variant="secondary" size="sm" icon={RotateCcw} onClick={this.handleReset}>Try again</Button>}
                />
            );
        }

        return this.props.children;
    }
}
