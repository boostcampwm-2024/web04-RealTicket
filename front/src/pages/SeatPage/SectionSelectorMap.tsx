import { getCenterCoordinate, getPathD } from '@/utils/svg.ts';

import { twMerge } from 'tailwind-merge';

interface ISectionSelectorMapProps {
  className?: string;
  viewBoxData: string;
  svgURL: string;
  sections: Section[];
  setSelectedSection: (id: string) => void;
  selectedSection: string | null;
}
export default function SectionSelectorMap({
  className,
  viewBoxData,
  svgURL,
  sections,
  setSelectedSection,
  selectedSection,
}: ISectionSelectorMapProps) {
  //TODO 글자 크기 section 크기에 맞춰서 변동되도록
  return (
    <svg viewBox={viewBoxData} className={twMerge('w-full', className)}>
      <image href={svgURL} className="h-full w-full"></image>
      {sections.map((section) => {
        const { id, points } = section;
        const [centerX, centerY] = getCenterCoordinate(...points);
        const d = getPathD(...points);
        const isActive = selectedSection === id || selectedSection === null;
        return (
          <g key={id} className="hover:cursor-pointer" onClick={() => setSelectedSection(id)}>
            <path className={isActive ? 'fill-primary' : 'fill-surface-sub'} d={d} />
            <text
              className="fill-typo-display text-[200px]"
              textAnchor="middle"
              dominantBaseline="middle"
              x={centerX}
              y={centerY}>{`${id} 구역`}</text>
          </g>
        );
      })}
    </svg>
  );
}

type Section = {
  id: string;
  points: number[][];
};
