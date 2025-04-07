import React, { memo, useMemo, useCallback } from "react";
import { message } from "antd";
import {
  useGetCodeArtifactDetail,
  useGetDocumentDetail,
} from "@refly-packages/ai-workspace-common/queries/queries";
import { useFetchShareData } from "@refly-packages/ai-workspace-common/hooks/use-fetch-share-data";
import Renderer from "@refly-packages/ai-workspace-common/modules/artifacts/code-runner/render";

// 接口定义
interface NodeData {
  title?: string;
  content?: string;
  metadata?: {
    [key: string]: any;
    url?: string;
    content?: string;
    status?: string;
  };
  entityId?: string;
  [key: string]: any;
}

interface NodeRelation {
  relationId: string;
  pageId?: string;
  nodeId: string;
  nodeType: string;
  entityId: string;
  orderIndex: number;
  nodeData: NodeData;
}

// 统一的工件渲染组件
const ArtifactRenderer = memo(
  ({
    node,
    type: rendererType,
  }: {
    node: NodeRelation;
    type: "document" | "code";
  }) => {
    const artifactId = node.nodeData?.entityId || "";

    const {
      title = rendererType === "document" ? "文档组件" : "代码组件",
      status,
      shareId,
      type = "text/html", // 默认类型
      language,
    } = node.nodeData?.metadata || {};

    // 根据类型选择不同的数据获取hook
    const { data: remoteData, isLoading: isRemoteLoading } =
      rendererType === "document"
        ? useGetDocumentDetail(
            {
              query: {
                docId: artifactId,
              },
            },
            [artifactId],
            {
              enabled: Boolean(
                !shareId && artifactId && status?.startsWith("finish")
              ),
            }
          )
        : useGetCodeArtifactDetail(
            {
              query: {
                artifactId,
              },
            },
            [artifactId],
            {
              enabled: Boolean(
                !shareId && artifactId && status?.startsWith("finish")
              ),
            }
          );

    const { data: shareData, loading: isShareLoading } =
      useFetchShareData(shareId);

    const isLoading = isRemoteLoading || isShareLoading;

    // 合并数据源
    const artifactData = useMemo(
      () => shareData || remoteData?.data || null,
      [shareData, remoteData]
    );

    // 获取内容
    const content =
      artifactData?.content || node.nodeData?.metadata?.content || "";

    // 确定当前使用的渲染类型
    const currentType =
      rendererType === "document"
        ? "text/markdown"
        : artifactData?.type || type;

    const handleRequestFix = useCallback((error: string) => {
      message.warning(`需要修复代码: ${error}`);
    }, []);

    // 根据类型获取显示名称
    const getTypeDisplayName = (typeStr: string) => {
      if (typeStr === "text/html") return "网页渲染";
      if (typeStr === "application/refly.artifacts.react") return "React组件";
      if (typeStr === "application/refly.artifacts.mermaid") return "流程图";
      if (typeStr === "application/refly.artifacts.mindmap") return "思维导图";
      if (typeStr === "text/markdown") return "Markdown";
      if (typeStr === "application/refly.artifacts.code") return "代码";
      if (typeStr === "image/svg+xml") return "SVG图像";

      // 检查是否为已知类型
      if (
        ![
          "text/html",
          "application/refly.artifacts.react",
          "application/refly.artifacts.mermaid",
          "application/refly.artifacts.mindmap",
          "text/markdown",
          "application/refly.artifacts.code",
          "image/svg+xml",
        ].includes(typeStr)
      ) {
        return typeStr;
      }
      return "";
    };

    if (!artifactId) {
      return (
        <div className="h-full flex items-center justify-center bg-white rounded p-3">
          <span className="text-gray-500">
            未选择{rendererType === "document" ? "文档" : "代码"}组件
          </span>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex h-full w-full grow items-center justify-center">
          <div className="text-gray-500">
            {rendererType === "document" ? "文档" : "代码"}加载中...
          </div>
        </div>
      );
    }

    return (
      <div className="h-full bg-white rounded px-4 pb-4">
        <div className="h-full w-full overflow-hidden flex flex-col">
          <div className="flex items-center justify-between py-2 border-b">
            <div className="font-medium text-gray-800">{title}</div>
            <div className="text-xs text-gray-500">
              {getTypeDisplayName(currentType)}
            </div>
          </div>
          <div
            className={`flex-1 overflow-${rendererType === "document" ? "auto" : "hidden"}`}
          >
            {status === "generating" ? (
              <div className="flex h-full w-full items-center justify-center">
                <div className="text-gray-500">
                  {rendererType === "document" ? "文档" : "代码"}生成中...
                </div>
              </div>
            ) : (
              <Renderer
                content={content}
                type={currentType}
                title={title}
                language={artifactData?.language || language}
                readonly
                onRequestFix={handleRequestFix}
                width="100%"
                height="100%"
              />
            )}
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // 只有当节点ID、类型和关键元数据没有变化时，跳过重新渲染
    const prevMetadata = prevProps.node.nodeData?.metadata || {};
    const nextMetadata = nextProps.node.nodeData?.metadata || {};

    return (
      prevProps.type === nextProps.type &&
      prevProps.node.entityId === nextProps.node.entityId &&
      prevMetadata.content === nextMetadata.content &&
      prevMetadata.status === nextMetadata.status &&
      prevMetadata.type === nextMetadata.type
    );
  }
);

export { ArtifactRenderer, type NodeRelation, type NodeData };
