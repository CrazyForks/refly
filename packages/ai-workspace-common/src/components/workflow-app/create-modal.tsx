import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, message, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import getClient from '@refly-packages/ai-workspace-common/requests/proxiedRequest';
import { useCanvasContext } from '@refly-packages/ai-workspace-common/context/canvas';
import { copyToClipboard } from '@refly-packages/ai-workspace-common/utils';
import { Checked } from 'refly-icons';

interface CreateWorkflowAppModalProps {
  title: string;
  canvasId: string;
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

interface SuccessMessageProps {
  appId: string;
}

// Success message shown inside antd message with share link and copy action
const SuccessMessage = memo(({ appId }: SuccessMessageProps) => {
  const { t } = useTranslation();
  const shareLink = useMemo(() => `${window.location.origin}/app/${appId}`, [appId]);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!shareLink) return;
    try {
      copyToClipboard(shareLink);
      setCopied(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to copy link:', err);
    }
  }, [shareLink]);

  return (
    <div className="flex items-center gap-2">
      <Checked size={20} color="#12B76A" />
      <span className="text-base font-medium text-refly-text-0">
        {t('workflowApp.publishSuccess')}
      </span>
      <div className="flex items-center gap-2 border border-refly-Card-Border bg-refly-bg-content-z1 rounded-full pl-3 pr-1 py-1 max-w-[500px] bg-gray-100 dark:bg-gray-800">
        <span className="flex-1 text-sm text-refly-text-1 leading-5 max-w-[260px] overflow-hidden text-ellipsis">
          {shareLink}
        </span>
        <Button
          size="small"
          className="!h-[28px] !px-3 rounded-full text-sm text-refly-text-0"
          onClick={handleCopy}
        >
          {copied ? t('shareContent.linkCopied') : t('shareContent.copyLink')}
        </Button>
      </div>
    </div>
  );
});

SuccessMessage.displayName = 'SuccessMessage';

export const CreateWorkflowAppModal = ({
  canvasId,
  title,
  visible,
  setVisible,
}: CreateWorkflowAppModalProps) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const [confirmLoading, setConfirmLoading] = useState(false);
  // const { uploadCanvasCover } = useExportCanvasAsImage();

  const { workflow } = useCanvasContext();
  const { workflowVariables } = workflow ?? {};

  const createWorkflowApp = async ({
    title,
    description,
  }: { title: string; description: string }) => {
    if (confirmLoading) return;

    setConfirmLoading(true);

    try {
      const { data } = await getClient().createWorkflowApp({
        body: {
          title,
          description,
          canvasId,
          query: '', // TODO: support query edit
          variables: workflowVariables ?? [],
        },
      });

      const appId = data?.data?.appId ?? '';

      if (data?.success && appId) {
        setVisible(false);
        messageApi.open({ content: <SuccessMessage appId={appId} />, duration: 5 });
      } else if (!data?.success) {
        message.error(t('common.operationFailed'));
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error creating workflow app', error);
      message.error(t('common.operationFailed'));
    } finally {
      setConfirmLoading(false);
    }
  };

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      await createWorkflowApp(values);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error validating form fields', error);
    }
  };

  useEffect(() => {
    if (visible) {
      form.setFieldsValue({
        title,
        description: '',
      });
    }
  }, [visible]);

  return (
    <Modal
      centered
      open={visible}
      onCancel={() => setVisible(false)}
      onOk={onSubmit}
      confirmLoading={confirmLoading}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
      title={t('workflowApp.publish')}
    >
      {contextHolder}
      <div className="w-full h-full pt-4 overflow-y-auto">
        <Form form={form} labelCol={{ span: 5 }}>
          <Form.Item
            required
            label={t('workflowApp.title')}
            name="title"
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Input placeholder={t('workflowApp.titlePlaceholder')} />
          </Form.Item>
          <Form.Item label={t('workflowApp.description')} name="description">
            <Input.TextArea
              autoSize={{ minRows: 3, maxRows: 6 }}
              placeholder={t('workflowApp.descriptionPlaceholder')}
            />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
};
