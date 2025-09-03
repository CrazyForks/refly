import { useTranslation } from 'react-i18next';
import { IContextItem } from '@refly/common-types';
import { useMemo, memo, useState, useCallback, useEffect, useRef } from 'react';
import { SelectedSkillHeader } from '@refly-packages/ai-workspace-common/components/canvas/launchpad/selected-skill-header';
import { ContextManager } from '@refly-packages/ai-workspace-common/components/canvas/launchpad/context-manager';
import { RichChatInput } from '@refly-packages/ai-workspace-common/components/canvas/launchpad/rich-chat-input';
import {
  ChatActions,
  CustomAction,
} from '@refly-packages/ai-workspace-common/components/canvas/launchpad/chat-actions';
import {
  ModelInfo,
  SkillRuntimeConfig,
  SkillTemplateConfig,
} from '@refly-packages/ai-workspace-common/requests/types.gen';
import { useInvokeAction } from '@refly-packages/ai-workspace-common/hooks/canvas/use-invoke-action';
import { convertContextItemsToEdges } from '@refly/canvas-common';
import { useCanvasContext } from '@refly-packages/ai-workspace-common/context/canvas';
import { useReactFlow } from '@xyflow/react';
import { useFindSkill } from '@refly-packages/ai-workspace-common/hooks/use-find-skill';
import { useUploadImage } from '@refly-packages/ai-workspace-common/hooks/use-upload-image';
import { notification, Form } from 'antd';
import { ConfigManager } from '@refly-packages/ai-workspace-common/components/canvas/launchpad/config-manager';
import { useAskProject } from '@refly-packages/ai-workspace-common/hooks/canvas/use-ask-project';
import { useUpdateNodeQuery } from '@refly-packages/ai-workspace-common/hooks/use-update-node-query';
import { useActionResultStoreShallow } from '@refly/stores';
import getClient from '@refly-packages/ai-workspace-common/requests/proxiedRequest';
import { Undo } from 'refly-icons';
import { GenericToolset } from '@refly/openapi-schema';
import { useSetNodeDataByEntity } from '@refly-packages/ai-workspace-common/hooks/canvas';
import { nodeOperationsEmitter } from '@refly-packages/ai-workspace-common/events/nodeOperations';
import { useAddNode } from '@refly-packages/ai-workspace-common/hooks/canvas/use-add-node';
import { useGetWorkflowVariables } from '@refly-packages/ai-workspace-common/queries';
import type { MentionVariable } from '@refly-packages/ai-workspace-common/components/canvas/launchpad/types';
import { processQueryWithVariables } from '@refly-packages/ai-workspace-common/utils/workflow-variable-processor';

interface EditChatInputProps {
  enabled: boolean;
  resultId: string;
  version?: number;
  contextItems: IContextItem[];
  query: string;
  modelInfo: ModelInfo;
  actionMeta?: {
    icon?: any;
    name?: string;
  };
  setEditMode: (mode: boolean) => void;
  readonly?: boolean;
  tplConfig?: SkillTemplateConfig;
  runtimeConfig?: SkillRuntimeConfig;
  onQueryChange?: (newQuery: string) => void;
  selectedToolsets?: GenericToolset[];
  setSelectedToolsets?: (toolsets: GenericToolset[]) => void;
}

const EditChatInputComponent = (props: EditChatInputProps) => {
  const {
    enabled,
    resultId,
    version,
    contextItems,
    query,
    modelInfo,
    actionMeta,
    setEditMode,
    readonly,
    tplConfig: initialTplConfig,
    runtimeConfig,
    onQueryChange,
    selectedToolsets,
    setSelectedToolsets,
  } = props;

  const { getEdges, getNodes, deleteElements, addEdges } = useReactFlow();
  const [editQuery, setEditQuery] = useState<string>(query);
  const [editContextItems, setEditContextItems] = useState<IContextItem[]>(contextItems);
  const [editModelInfo, setEditModelInfo] = useState<ModelInfo>(modelInfo);
  const [editRuntimeConfig, setEditRuntimeConfig] = useState<SkillRuntimeConfig>(runtimeConfig);
  const contextItemsRef = useRef(editContextItems);
  const isInternalUpdateRef = useRef(false);
  const setNodeDataByEntity = useSetNodeDataByEntity();

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const { t } = useTranslation();
  const [localActionMeta, setLocalActionMeta] = useState<{
    name?: string;
    icon?: any;
  } | null>(actionMeta);

  const [form] = Form.useForm();
  const { getFinalProjectId } = useAskProject();
  const updateNodeQuery = useUpdateNodeQuery();

  // Get action result from store to access original input.query
  const { resultMap } = useActionResultStoreShallow((state) => ({
    resultMap: state.resultMap,
  }));
  const { addNode } = useAddNode();

  const hideSelectedSkillHeader = useMemo(
    () => !localActionMeta || localActionMeta?.name === 'commonQnA' || !localActionMeta?.name,
    [localActionMeta],
  );

  // Function to get original query from action result
  const getOriginalQuery = useCallback(async (): Promise<string> => {
    // First try to get from store
    const actionResult = resultMap[resultId];
    if (actionResult?.input?.query) {
      return actionResult.input.query;
    }

    // Fallback to API call if not in store
    try {
      const { data, error } = await getClient().getActionResult({
        query: { resultId },
      });

      if (!error && data?.success && data?.data?.input?.query) {
        return data.data.input.query;
      }
    } catch (error) {
      console.error('Failed to fetch action result:', error);
    }

    // Final fallback to current query prop
    return query;
  }, [resultMap, resultId, query]);

  const { canvasId, readonly: canvasReadonly } = useCanvasContext();
  const { invokeAction } = useInvokeAction({ source: 'edit-chat-input' });
  const skill = useFindSkill(localActionMeta?.name);
  const {
    handleUploadImage: uploadImageHook,
    handleUploadMultipleImages: uploadMultipleImagesHook,
  } = useUploadImage();

  const textareaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (enabled && textareaRef.current) {
      const textarea = textareaRef.current.querySelector('textarea');
      if (textarea) {
        const length = textarea.value.length;
        textarea.focus();
        textarea.setSelectionRange(length, length);
      }
    }
  }, [enabled]);

  // Initialize form with tplConfig when skill changes
  useEffect(() => {
    if (!skill?.configSchema?.items?.length) {
      form.setFieldValue('tplConfig', undefined);
    } else {
      // Create a new config object
      const newConfig = {};

      // Process each item in the schema
      for (const item of skill?.configSchema?.items || []) {
        const key = item.key;

        // Priority 1: Check if the key exists in initialTplConfig
        if (initialTplConfig && initialTplConfig[key] !== undefined) {
          newConfig[key] = initialTplConfig[key];
        }
        // Priority 2: Fall back to schema default value
        else if (item.defaultValue !== undefined) {
          newConfig[key] = {
            value: item.defaultValue,
            label: item.labelDict?.en ?? item.key,
            displayValue: String(item.defaultValue),
          };
        }
      }

      // Set the form value with the properly prioritized config
      form.setFieldValue('tplConfig', newConfig);
    }
  }, [skill, form, initialTplConfig]);

  useEffect(() => {
    contextItemsRef.current = editContextItems;
  }, [editContextItems]);

  // Real-time query update to canvas and parent component
  useEffect(() => {
    // Find current node to get nodeId
    const nodes = getNodes();
    const currentNode = nodes.find((node) => node.data?.entityId === resultId);

    if (currentNode && editQuery !== query) {
      // Mark this as an internal update to prevent circular dependency
      isInternalUpdateRef.current = true;

      // Update the query in real-time to MinIO
      updateNodeQuery(editQuery, resultId, currentNode.id, 'skillResponse');

      // Notify parent component of the query change
      if (onQueryChange) {
        onQueryChange(editQuery);
      }
    }
  }, [editQuery, resultId, query, getNodes, updateNodeQuery, onQueryChange]);

  // Sync internal state with props changes - but avoid circular updates
  useEffect(() => {
    // Only update if the query prop is different from current editQuery
    // and it's not coming from our own update (avoid circular dependency)
    if (query !== editQuery && !isInternalUpdateRef.current) {
      setEditQuery(query);
    }

    // Reset the internal update flag
    if (isInternalUpdateRef.current) {
      isInternalUpdateRef.current = false;
    }
  }, [query, editQuery]);

  useEffect(() => {
    setEditContextItems(contextItems);
  }, [contextItems]);

  useEffect(() => {
    setEditModelInfo(modelInfo);
  }, [modelInfo]);

  useEffect(() => {
    setEditRuntimeConfig(runtimeConfig);
  }, [runtimeConfig]);

  useEffect(() => {
    setLocalActionMeta(actionMeta);
  }, [actionMeta]);

  const handleSendMessage = useCallback(() => {
    // Check for form errors
    if (formErrors && Object.keys(formErrors).length > 0) {
      notification.error({
        message: t('copilot.configManager.errorTipTitle'),
        description: t('copilot.configManager.errorTip'),
      });
      return;
    }

    // Get tplConfig from form
    const tplConfig = form?.getFieldValue('tplConfig');
    const finalProjectId = getFinalProjectId();

    // Synchronize edges with latest context items
    const nodes = getNodes();
    let currentNode = nodes.find((node) => node.data?.entityId === resultId);

    // Check if this is a media generation model
    const isMediaGeneration = editModelInfo?.category === 'mediaGeneration';

    // If not found by entityId and is media generation, try to find by metadata.resultId
    if (!currentNode && isMediaGeneration) {
      currentNode = nodes.find((node) => (node.data?.metadata as any)?.resultId === resultId);
    }

    if (!currentNode) {
      return;
    }

    if (isMediaGeneration) {
      // Handle media generation using existing media generation flow
      // Parse capabilities from modelInfo
      const capabilities = editModelInfo?.capabilities as any;
      const mediaType = capabilities?.image
        ? 'image'
        : capabilities?.video
          ? 'video'
          : capabilities?.audio
            ? 'audio'
            : 'image'; // Default fallback

      // Emit media generation event
      nodeOperationsEmitter.emit('generateMedia', {
        providerItemId: editModelInfo?.providerItemId ?? '',
        targetType: 'canvas',
        targetId: canvasId ?? '',
        mediaType,
        query: editQuery,
        modelInfo: editModelInfo,
        nodeId: currentNode.id,
        contextItems: editContextItems,
      });

      setEditMode(false);
      return;
    }

    const edges = getEdges();
    const { edgesToAdd, edgesToDelete } = convertContextItemsToEdges(
      resultId,
      editContextItems,
      nodes,
      edges,
    );
    addEdges(edgesToAdd);
    deleteElements({ edges: edgesToDelete });

    // Process query with workflow variables
    const variables = (workflowVariables?.data ?? []) as MentionVariable[];
    const { query: processedQuery } = processQueryWithVariables(editQuery, variables);

    invokeAction(
      {
        resultId,
        version: (version ?? 0) + 1,
        query: processedQuery, // Use processed query for skill execution
        contextItems: editContextItems,
        modelInfo: editModelInfo,
        selectedSkill: skill,
        tplConfig,
        projectId: finalProjectId,
        selectedToolsets,
      },
      {
        entityId: canvasId,
        entityType: 'canvas',
      },
    );
    // Update node data with processed query for title and original query in structuredData
    setNodeDataByEntity(
      { entityId: resultId, type: 'skillResponse' },
      {
        title: processedQuery, // Use processed query for title
        metadata: {
          selectedToolsets,
          structuredData: {
            query: editQuery, // Store original query in structuredData
          },
        },
      },
    );

    setEditMode(false);
  }, [
    resultId,
    editQuery,
    editModelInfo,
    editContextItems,
    skill,
    version,
    canvasId,
    getNodes,
    getEdges,
    addEdges,
    deleteElements,
    invokeAction,
    setEditMode,
    formErrors,
    t,
    form,
    getFinalProjectId,
    selectedToolsets,
    setNodeDataByEntity,
    addNode,
  ]);

  const handleImageUpload = async (file: File) => {
    const nodeData = await uploadImageHook(file, canvasId);
    if (nodeData) {
      setEditContextItems([
        ...(contextItemsRef.current || []),
        {
          type: 'image',
          ...nodeData,
        },
      ]);
    }
  };

  const handleMultipleImagesUpload = async (files: File[]) => {
    const nodesData = await uploadMultipleImagesHook(files, canvasId);
    if (nodesData?.length) {
      const newContextItems = nodesData.map((nodeData) => ({
        type: 'image' as const,
        ...nodeData,
      }));

      setEditContextItems([...editContextItems, ...newContextItems]);
    }
  };

  const customActions: CustomAction[] = useMemo(
    () => [
      {
        icon: <Undo className="flex items-center w-5 h-5" />,
        title: t('copilot.chatActions.discard'),
        onClick: async () => {
          setEditMode(false);

          // Get original query from action result
          const originalQuery = await getOriginalQuery();
          setEditQuery(originalQuery);

          setEditContextItems(contextItems);
          setEditModelInfo(modelInfo);
          setEditRuntimeConfig(runtimeConfig);

          // Reset form values
          if (initialTplConfig) {
            form.setFieldValue('tplConfig', initialTplConfig);
          }
        },
      },
    ],
    [
      t,
      setEditMode,
      contextItems,
      modelInfo,
      runtimeConfig,
      form,
      initialTplConfig,
      getOriginalQuery,
    ],
  );

  // Fetch workflow variables for mentions (startNode/resourceLibrary)
  const { data: workflowVariables } = useGetWorkflowVariables({
    query: {
      canvasId,
    },
  });

  const variables: MentionVariable[] = useMemo(() => {
    return (workflowVariables?.data ?? []) as MentionVariable[];
  }, [workflowVariables?.data]);

  if (!enabled) {
    return null;
  }

  return (
    <div
      className="px-4 py-3 border-[1px] border-solid border-refly-primary-default rounded-[16px] flex flex-col gap-2"
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {!hideSelectedSkillHeader && (
        <SelectedSkillHeader
          readonly={readonly}
          skill={{
            icon: localActionMeta?.icon,
            name: localActionMeta?.name,
          }}
          className="rounded-t-[7px]"
          onClose={() => {
            setLocalActionMeta(null);
          }}
        />
      )}
      <ContextManager contextItems={editContextItems} setContextItems={setEditContextItems} />
      <RichChatInput
        ref={textareaRef}
        readonly={canvasReadonly}
        query={editQuery}
        setQuery={setEditQuery}
        selectedSkillName={localActionMeta?.name}
        handleSendMessage={handleSendMessage}
        onUploadImage={handleImageUpload}
        onUploadMultipleImages={handleMultipleImagesUpload}
        contextItems={editContextItems}
        setContextItems={setEditContextItems}
        variables={variables}
      />

      {skill?.configSchema?.items?.length > 0 && (
        <ConfigManager
          readonly={canvasReadonly}
          key={skill?.name}
          form={form}
          formErrors={formErrors}
          setFormErrors={setFormErrors}
          schema={skill?.configSchema}
          tplConfig={initialTplConfig}
          fieldPrefix="tplConfig"
          configScope="runtime"
          resetConfig={() => {
            // Reset to skill's tplConfig if available, otherwise create a new default config
            if (skill?.tplConfig) {
              form.setFieldValue('tplConfig', skill.tplConfig);
            } else {
              const defaultConfig = {};
              for (const item of skill?.configSchema?.items || []) {
                if (item.defaultValue !== undefined) {
                  defaultConfig[item.key] = {
                    value: item.defaultValue,
                    label: item.labelDict?.en ?? item.key,
                    displayValue: String(item.defaultValue),
                  };
                }
              }
              form.setFieldValue('tplConfig', defaultConfig);
            }
          }}
        />
      )}

      <ChatActions
        query={editQuery}
        model={editModelInfo}
        setModel={setEditModelInfo}
        runtimeConfig={editRuntimeConfig}
        setRuntimeConfig={setEditRuntimeConfig}
        handleSendMessage={handleSendMessage}
        handleAbort={() => {}}
        onUploadImage={handleImageUpload}
        contextItems={editContextItems}
        form={form}
        customActions={customActions}
        selectedToolsets={selectedToolsets}
        setSelectedToolsets={setSelectedToolsets}
      />
    </div>
  );
};

const arePropsEqual = (prevProps: EditChatInputProps, nextProps: EditChatInputProps) => {
  return (
    prevProps.enabled === nextProps.enabled &&
    prevProps.resultId === nextProps.resultId &&
    prevProps.query === nextProps.query &&
    prevProps.modelInfo === nextProps.modelInfo &&
    prevProps.readonly === nextProps.readonly &&
    prevProps.contextItems === nextProps.contextItems &&
    prevProps.actionMeta?.name === nextProps.actionMeta?.name &&
    prevProps.tplConfig === nextProps.tplConfig &&
    prevProps.onQueryChange === nextProps.onQueryChange &&
    prevProps.selectedToolsets === nextProps.selectedToolsets &&
    prevProps.setSelectedToolsets === nextProps.setSelectedToolsets
  );
};

export const EditChatInput = memo(EditChatInputComponent, arePropsEqual);
