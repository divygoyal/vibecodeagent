declare module 'react-simple-maps' {
    import React from 'react';

    export interface ComposableMapProps {
        projection?: string;
        projectionConfig?: Record<string, any>;
        width?: number;
        height?: number;
        style?: React.CSSProperties;
        children?: React.ReactNode;
    }

    export interface ZoomableGroupProps {
        zoom?: number;
        center?: [number, number];
        minZoom?: number;
        maxZoom?: number;
        children?: React.ReactNode;
    }

    export interface GeographiesProps {
        geography: string | object;
        children: (data: { geographies: any[] }) => React.ReactNode;
    }

    export interface GeographyProps {
        geography: any;
        fill?: string;
        stroke?: string;
        strokeWidth?: number;
        style?: {
            default?: React.CSSProperties & { outline?: string };
            hover?: React.CSSProperties & { outline?: string };
            pressed?: React.CSSProperties & { outline?: string };
        };
        onMouseEnter?: (event: React.MouseEvent) => void;
        onMouseLeave?: (event: React.MouseEvent) => void;
        onClick?: (event: React.MouseEvent) => void;
    }

    export interface MarkerProps {
        coordinates: [number, number];
        children?: React.ReactNode;
    }

    export const ComposableMap: React.FC<ComposableMapProps>;
    export const ZoomableGroup: React.FC<ZoomableGroupProps>;
    export const Geographies: React.FC<GeographiesProps>;
    export const Geography: React.FC<GeographyProps>;
    export const Marker: React.FC<MarkerProps>;
}
