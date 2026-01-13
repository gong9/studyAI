// 工作流组件导出
export { BaseNode, type BaseNodeProps, type NodeStatus, type NodeDimensions } from './BaseNode';
export { ConnectionLine, ConnectionLineDefs, type ConnectionLineProps, type NodePosition } from './ConnectionLine';

// 节点组件
export { ModeNode, type SourceMode } from './nodes/ModeNode';
export { InputNode } from './nodes/InputNode';
export { ParseNode } from './nodes/ParseNode';
export { SelectNode } from './nodes/SelectNode';
export { ScriptNode } from './nodes/ScriptNode';
export { PPTNode } from './nodes/PPTNode';
export { CourseNode } from './nodes/CourseNode';

// 弹窗组件
export { DocumentsModal } from './modals/DocumentsModal';
export { ChaptersModal } from './modals/ChaptersModal';
export { ManuscriptModal } from './modals/ManuscriptModal';
export { ManuscriptEditorModal } from './modals/ManuscriptEditorModal';
export { PPTPreviewModal } from './modals/PPTPreviewModal';

