import { calculatePolygonCentroid, getPathD } from '@/utils/svg.ts';

import { twMerge } from 'tailwind-merge';

interface ISectionSelectorMapProps {
  className?: string;
  viewBoxData: string;
  svgURL: string;
  sections: Section[];
  setSelectedSection: (id: number) => void;
  selectedSection: number | null;
}
export default function SectionSelectorMap({
  className,
  viewBoxData,
  svgURL,
  sections,
  setSelectedSection,
  selectedSection,
}: ISectionSelectorMapProps) {
  //TODO 글자 크기 section 크기에 맞춰서 변동되도록,
  return (
    <svg viewBox={viewBoxData} className={twMerge('w-full', className)}>
      <image href={svgURL} className="h-full w-full"></image>
      {sections.map((section, index) => {
        const { id, points } = section;
        const [textX, textY] = calculatePolygonCentroid(points);
        const d = getPathD(...points);
        const isActive = selectedSection === index || selectedSection === null;
        return (
          <g key={id} className="hover:cursor-pointer" onClick={() => setSelectedSection(index)}>
            <path className={isActive ? 'fill-primary' : 'fill-surface-sub'} d={d} />
            <text
              className="fill-typo text-[200px]"
              fontWeight={'bold'}
              textAnchor="middle"
              dominantBaseline="middle"
              x={textX}
              y={textY}>{`${id}`}</text>
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
