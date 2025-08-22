import { useCanvasContext } from '@refly-packages/ai-workspace-common/context/canvas';
import { memo, useMemo, useState } from 'react';
import { Divider, Button, Popconfirm, message } from 'antd';
import { Add, Edit, Delete } from 'refly-icons';
import type { WorkflowVariable } from '@refly/openapi-schema';
import { Spin } from '@refly-packages/ai-workspace-common/components/common/spin';
import { VARIABLE_TYPE_ICON_MAP } from '../nodes/start';
import { useTranslation } from 'react-i18next';
import SVGX from '../../../assets/x.svg';
import { CreateVariablesModal } from '../workflow-variables/create-variables-modal';
import getClient from '@refly-packages/ai-workspace-common/requests/proxiedRequest';

type VariableType = 'string' | 'option' | 'resource';
const MAX_VARIABLE_LENGTH = {
  string: 10,
  option: 10,
  resource: 30,
};

const VariableItem = memo(
  ({
    canvasId,
    totalVariables,
    refetchWorkflowVariables,
    variable,
    onEdit,
  }: {
    canvasId: string;
    totalVariables: WorkflowVariable[];
    refetchWorkflowVariables: () => void;
    variable: WorkflowVariable;
    onEdit?: (variable: WorkflowVariable) => void;
  }) => {
    const { name, variableType, required, isSingle } = variable;
    const { t } = useTranslation();
    const [isPopconfirmOpen, setIsPopconfirmOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDeleteVariable = async (variable: WorkflowVariable) => {
      const newVariables = totalVariables.filter((v) => v.variableId !== variable.variableId);
      try {
        setIsDeleting(true);
        const { data } = await getClient().updateWorkflowVariables({
          body: {
            canvasId: canvasId,
            variables: newVariables,
          },
        });
        if (data?.success) {
          message.success(
            t('canvas.workflow.variables.deleteSuccess') || 'Variable deleted successfully',
          );
          refetchWorkflowVariables();
        }
      } catch (error) {
        console.error('Failed to delete variable:', error);
      } finally {
        setIsDeleting(false);
      }
    };

    return (
      <div
        className={`group flex h-9 box-border gap-2 items-center justify-between py-1.5 px-3 bg-refly-bg-body-z0 rounded-xl border-[1px] border-solid border-refly-Card-Border cursor-pointer ${
          isPopconfirmOpen ? 'bg-refly-tertiary-hover' : 'hover:bg-refly-tertiary-hover'
        }`}
      >
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <img src={SVGX} alt="x" className="w-[10px] h-[10px] flex-shrink-0" />
          <Divider type="vertical" className="bg-refly-Card-Border mx-2 my-0 flex-shrink-0" />
          <div className="text-sm font-medium text-refly-text-1 truncate max-w-full">{name}</div>
          {required && (
            <div className="h-4 px-1 flex items-center justify-center text-refly-text-2 text-[10px] leading-[14px] border-[1px] border-solid border-refly-Card-Border rounded-[4px] flex-shrink-0">
              {t('canvas.workflow.variables.required')}
            </div>
          )}
          {['option', 'resource'].includes(variableType) && (
            <div className="h-4 px-1 flex items-center justify-center text-refly-text-2 text-[10px] leading-[14px] border-[1px] border-solid border-refly-Card-Border rounded-[4px] flex-shrink-0">
              {t(`canvas.workflow.variables.${isSingle ? 'singleSelect' : 'multipleSelect'}`)}
            </div>
          )}
        </div>

        <div
          className={`items-center gap-1 flex-shrik-0 ${
            isPopconfirmOpen ? 'flex' : 'hidden group-hover:flex'
          }`}
        >
          <Button
            type="text"
            size="small"
            icon={<Edit size={16} />}
            onClick={() => onEdit?.(variable)}
          />
          <Popconfirm
            title={t('canvas.workflow.variables.deleteConfirm') || 'Delete this variable?'}
            onConfirm={() => handleDeleteVariable(variable)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            onOpenChange={setIsPopconfirmOpen}
            okButtonProps={{ loading: isDeleting }}
          >
            <Button
              type="text"
              size="small"
              icon={<Delete size={16} />}
              className={isPopconfirmOpen ? 'bg-refly-tertiary-hover' : ''}
            />
          </Popconfirm>
        </div>
      </div>
    );
  },
);

// Variable type section component
const VariableTypeSection = ({
  canvasId,
  type,
  variables,
  totalVariables,
  refetchWorkflowVariables,
}: {
  canvasId: string;
  type: VariableType;
  variables: WorkflowVariable[];
  totalVariables: WorkflowVariable[];
  refetchWorkflowVariables: () => void;
}) => {
  const { t } = useTranslation();
  const Icon = VARIABLE_TYPE_ICON_MAP[type];
  const [showCreateVariablesModal, setShowCreateVariablesModal] = useState(false);
  const [currentVariable, setCurrentVariable] = useState<WorkflowVariable | null>(null);

  const handleCloseModal = () => {
    setShowCreateVariablesModal(false);
    setCurrentVariable(null);
  };

  const handleAddVariable = () => {
    setCurrentVariable(null);
    setShowCreateVariablesModal(true);
  };

  const handleEditVariable = (variable: WorkflowVariable) => {
    setCurrentVariable(variable);
    setShowCreateVariablesModal(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-refly-text-0">
          <Icon size={18} color="var(--refly-text-0)" className="flex-shrink-0" />
          <div className="text-sm font-semibold leading-6">
            {t(`canvas.workflow.variables.${type}`)}
          </div>
        </div>

        {variables.length > 0 && variables.length < MAX_VARIABLE_LENGTH[type] && (
          <Button
            type="text"
            size="small"
            onClick={handleAddVariable}
            disabled={variables.length >= MAX_VARIABLE_LENGTH[type]}
            icon={<Add size={16} />}
          />
        )}
      </div>

      {/* Variables list */}
      {variables.length > 0 ? (
        <div className="space-y-2">
          {variables.map((variable) => (
            <VariableItem
              key={variable.name}
              canvasId={canvasId}
              totalVariables={totalVariables}
              variable={variable}
              refetchWorkflowVariables={refetchWorkflowVariables}
              onEdit={handleEditVariable}
            />
          ))}
        </div>
      ) : (
        <div className="px-3 py-6 gap-0.5 flex items-center justify-center bg-refly-bg-control-z0 rounded-lg">
          <div className="text-xs text-refly-text-1 leading-4">
            {t('canvas.workflow.variables.empty') || 'No variables defined'}
          </div>
          <Button
            type="text"
            size="small"
            className="text-xs leading-4 font-semibold !text-refly-primary-default p-0.5 !h-5 box-border hover:bg-refly-tertiary-hover"
            onClick={handleAddVariable}
          >
            {t('canvas.workflow.variables.addVariable') || 'Add'}
          </Button>
        </div>
      )}

      <CreateVariablesModal
        visible={showCreateVariablesModal}
        onCancel={handleCloseModal}
        variableType={type}
        defaultValue={currentVariable}
      />
    </div>
  );
};

export const StartNodePreview = () => {
  const { workflow, canvasId } = useCanvasContext();
  const { workflowVariables, workflowVariablesLoading, refetchWorkflowVariables } = workflow;

  // Group variables by type
  const groupedVariables = useMemo(() => {
    const groups = {
      string: [] as WorkflowVariable[],
      resource: [] as WorkflowVariable[],
      option: [] as WorkflowVariable[],
    };

    if (workflowVariables) {
      for (const variable of workflowVariables) {
        const type = variable.variableType ?? 'string';
        if (groups[type]) {
          groups[type].push(variable);
        }
      }
    }

    return groups;
  }, [workflowVariables]);

  if (workflowVariablesLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <Spin />
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto p-4">
      <div className="space-y-6">
        <VariableTypeSection
          canvasId={canvasId}
          type="string"
          variables={groupedVariables.string}
          totalVariables={workflowVariables}
          refetchWorkflowVariables={refetchWorkflowVariables}
        />

        <VariableTypeSection
          canvasId={canvasId}
          type="resource"
          variables={groupedVariables.resource}
          totalVariables={workflowVariables}
          refetchWorkflowVariables={refetchWorkflowVariables}
        />

        <VariableTypeSection
          canvasId={canvasId}
          type="option"
          variables={groupedVariables.option}
          totalVariables={workflowVariables}
          refetchWorkflowVariables={refetchWorkflowVariables}
        />
      </div>
    </div>
  );
};
