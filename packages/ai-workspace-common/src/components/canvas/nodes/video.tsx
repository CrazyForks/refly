import { memo, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useReactFlow, Position } from '@xyflow/react';
import { CanvasNode } from '@refly/canvas-common';
import { useNodeHoverEffect } from '@refly-packages/ai-workspace-common/hooks/canvas/use-node-hover';
import { getNodeCommonStyles } from './index';
import { CustomHandle } from './shared/custom-handle';
import { NodeHeader } from './shared/node-header';
import {
  nodeActionEmitter,
  createNodeEventName,
  cleanupNodeEvents,
} from '@refly-packages/ai-workspace-common/events/nodeActions';
import { useAddNode } from '@refly-packages/ai-workspace-common/hooks/canvas/use-add-node';
import { genSkillID } from '@refly/utils/id';
import { IContextItem } from '@refly/common-types';
import { useAddToContext } from '@refly-packages/ai-workspace-common/hooks/canvas/use-add-to-context';
import { useDeleteNode } from '@refly-packages/ai-workspace-common/hooks/canvas/use-delete-node';
import { useSetNodeDataByEntity } from '@refly-packages/ai-workspace-common/hooks/canvas/use-set-node-data-by-entity';
import { useCanvasContext } from '@refly-packages/ai-workspace-common/context/canvas';
import cn from 'classnames';
import { useSelectedNodeZIndex } from '@refly-packages/ai-workspace-common/hooks/canvas/use-selected-node-zIndex';
import { NodeActionButtons } from './shared/node-action-buttons';
import { useGetNodeConnectFromDragCreateInfo } from '@refly-packages/ai-workspace-common/hooks/canvas/use-get-node-connect';
import { NodeDragCreateInfo } from '@refly-packages/ai-workspace-common/events/nodeOperations';
import { NodeProps } from '@xyflow/react';
import { CanvasNodeData } from '@refly/canvas-common';
import { useNodePreviewControl } from '@refly-packages/ai-workspace-common/hooks/canvas/use-node-preview-control';
import { ModelInfo } from '@refly/openapi-schema';
import { CanvasNodeType } from '@refly/openapi-schema';
import { useTranslation } from 'react-i18next';

// Define VideoNodeMeta interface
interface VideoNodeMeta {
  videoUrl?: string;
  storageKey?: string;
  showBorder?: boolean;
  showTitle?: boolean;
  style?: Record<string, any>;
  resultId?: string;
  contextItems?: IContextItem[];
  modelInfo?: ModelInfo;
}

interface VideoNodeProps extends NodeProps {
  data: CanvasNodeData<VideoNodeMeta>;
  isPreview?: boolean;
  hideHandles?: boolean;
  onNodeClick?: () => void;
}

// Fixed dimensions for video node
const NODE_SIDE_CONFIG = { width: 420, height: 'auto' };

export const VideoNode = memo(
  ({ id, data, isPreview, selected, hideHandles, onNodeClick }: VideoNodeProps) => {
    const { metadata } = data ?? {};
    const videoUrl = metadata?.videoUrl ?? '';
    const [isHovered, setIsHovered] = useState(false);
    const { handleMouseEnter: onHoverStart, handleMouseLeave: onHoverEnd } = useNodeHoverEffect(id);
    const videoRef = useRef<HTMLVideoElement>(null);
    useSelectedNodeZIndex(id, selected);
    const { addNode } = useAddNode();
    const { addToContext } = useAddToContext();
    const { deleteNode } = useDeleteNode();
    const setNodeDataByEntity = useSetNodeDataByEntity();
    const { getConnectionInfo } = useGetNodeConnectFromDragCreateInfo();
    const { readonly, canvasId } = useCanvasContext();
    const { previewNode } = useNodePreviewControl({ canvasId });
    const { t } = useTranslation();

    // Check if node has any connections
    const { getEdges } = useReactFlow();
    const edges = useMemo(() => getEdges(), [getEdges]);
    const isTargetConnected = edges?.some((edge) => edge.target === id);
    const isSourceConnected = edges?.some((edge) => edge.source === id);

    const handleMouseEnter = useCallback(() => {
      setIsHovered(true);
      onHoverStart();
    }, [onHoverStart]);

    const handleMouseLeave = useCallback(() => {
      setIsHovered(false);
      onHoverEnd();
    }, [onHoverEnd]);

    const handleAddToContext = useCallback(() => {
      addToContext({
        type: 'video',
        title: data.title,
        entityId: data.entityId,
        metadata: data.metadata,
      });
    }, [data, addToContext]);

    const handleDelete = useCallback(() => {
      deleteNode({
        id,
        type: 'video',
        data,
        position: { x: 0, y: 0 },
      } as unknown as CanvasNode);
    }, [id, data, deleteNode]);

    const handleAskAI = useCallback(
      (dragCreateInfo?: NodeDragCreateInfo) => {
        const { position, connectTo } = getConnectionInfo(
          { entityId: data.entityId, type: 'video' },
          dragCreateInfo,
        );

        addNode(
          {
            type: 'skill',
            data: {
              title: 'Skill',
              entityId: genSkillID(),
              metadata: {
                contextItems: [
                  {
                    type: 'video',
                    title: data.title,
                    entityId: data.entityId,
                    metadata: data.metadata,
                  },
                ] as IContextItem[],
              },
            },
            position,
          },
          connectTo,
          false,
          true,
        );
      },
      [data, addNode, getConnectionInfo],
    );

    const handleCloneAskAI = useCallback(async () => {
      const { contextItems, modelInfo } = data?.metadata || {};

      // Create new skill node with context
      const connectTo = contextItems?.map((item) => ({
        type: item.type as CanvasNodeType,
        entityId: item.entityId,
      }));

      // Create new skill node
      addNode(
        {
          type: 'skill',
          data: {
            title: t('canvas.nodeActions.cloneAskAI'),
            entityId: genSkillID(),
            metadata: {
              contextItems,
              query: data.title,
              modelInfo,
            },
          },
        },
        connectTo,
        false,
        true,
      );

      nodeActionEmitter.emit(createNodeEventName(id, 'cloneAskAI.completed'));
    }, [id, data?.entityId, addNode, t]);

    const onTitleChange = (newTitle: string) => {
      setNodeDataByEntity(
        {
          entityId: data.entityId,
          type: 'video',
        },
        {
          title: newTitle,
        },
      );
    };

    const handleVideoClick = useCallback(() => {
      // Create a node object for preview
      const nodeForPreview = {
        id,
        type: 'video' as const,
        data: data as any,
        position: { x: 0, y: 0 },
      };
      previewNode(nodeForPreview);
    }, [previewNode, id, data]);

    // Add event handling
    useEffect(() => {
      // Create node-specific event handlers
      const handleNodeAddToContext = () => handleAddToContext();
      const handleNodeDelete = () => handleDelete();
      const handleNodeAskAI = (event?: { dragCreateInfo?: NodeDragCreateInfo }) => {
        handleAskAI(event?.dragCreateInfo);
      };
      const handleNodeCloneAskAI = () => handleCloneAskAI();

      // Register events with node ID
      nodeActionEmitter.on(createNodeEventName(id, 'addToContext'), handleNodeAddToContext);
      nodeActionEmitter.on(createNodeEventName(id, 'delete'), handleNodeDelete);
      nodeActionEmitter.on(createNodeEventName(id, 'askAI'), handleNodeAskAI);
      nodeActionEmitter.on(createNodeEventName(id, 'cloneAskAI'), handleNodeCloneAskAI);

      return () => {
        // Cleanup events when component unmounts
        nodeActionEmitter.off(createNodeEventName(id, 'addToContext'), handleNodeAddToContext);
        nodeActionEmitter.off(createNodeEventName(id, 'delete'), handleNodeDelete);
        nodeActionEmitter.off(createNodeEventName(id, 'askAI'), handleNodeAskAI);
        nodeActionEmitter.off(createNodeEventName(id, 'cloneAskAI'), handleNodeCloneAskAI);

        // Clean up all node events
        cleanupNodeEvents(id);
      };
    }, [id, handleAddToContext, handleDelete, handleAskAI, handleCloneAskAI]);

    if (!data || !videoUrl) {
      return null;
    }

    return (
      <div
        onMouseEnter={!isPreview ? handleMouseEnter : undefined}
        onMouseLeave={!isPreview ? handleMouseLeave : undefined}
        className="rounded-2xl relative"
        style={NODE_SIDE_CONFIG}
        onClick={onNodeClick}
      >
        <div className="absolute -top-8 left-3 right-0 z-10 flex items-center h-8 gap-2 w-[80%]">
          <div
            className={cn(
              'flex-1 min-w-0 rounded-t-lg px-1 py-1 transition-opacity duration-200 bg-transparent',
              {
                'opacity-100': isHovered,
                'opacity-0': !isHovered,
              },
            )}
          >
            <NodeHeader
              title={data.title}
              type="video"
              canEdit={!readonly}
              updateTitle={onTitleChange}
            />
          </div>
        </div>

        {!isPreview && !readonly && (
          <NodeActionButtons
            nodeId={id}
            nodeType="video"
            isNodeHovered={isHovered}
            isSelected={selected}
          />
        )}

        {!isPreview && !hideHandles && (
          <>
            <CustomHandle
              id={`${id}-target`}
              nodeId={id}
              type="target"
              position={Position.Left}
              isConnected={isTargetConnected}
              isNodeHovered={isHovered}
              nodeType="video"
            />
            <CustomHandle
              id={`${id}-source`}
              nodeId={id}
              type="source"
              position={Position.Right}
              isConnected={isSourceConnected}
              isNodeHovered={isHovered}
              nodeType="video"
            />
          </>
        )}

        <div
          className={`h-full flex items-center justify-center relative z-1 box-border ${getNodeCommonStyles({ selected, isHovered })}`}
          style={{ cursor: isPreview || readonly ? 'default' : 'pointer' }}
          onClick={handleVideoClick}
        >
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="w-full h-full object-contain bg-black"
            preload="metadata"
            onError={(e) => {
              console.error('Video failed to load:', e);
            }}
          >
            <track kind="captions" />
            Your browser does not support the video tag.
          </video>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.id === nextProps.id &&
      prevProps.selected === nextProps.selected &&
      prevProps.isPreview === nextProps.isPreview &&
      prevProps.hideHandles === nextProps.hideHandles &&
      prevProps.data?.title === nextProps.data?.title &&
      JSON.stringify(prevProps.data?.metadata) === JSON.stringify(nextProps.data?.metadata)
    );
  },
);

VideoNode.displayName = 'VideoNode';
