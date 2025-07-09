import { useEffect } from 'react';

import { useChatStoreShallow } from '@refly-packages/ai-workspace-common/stores/chat';
import { useListProviderItems } from '@refly-packages/ai-workspace-common/queries';
import { useUserStoreShallow } from '@refly-packages/ai-workspace-common/stores/user';

export const useGetMediaModel = () => {
  const { setMediaModelList, setMediaModelListLoading } = useChatStoreShallow((state) => ({
    setMediaModelList: state.setMediaModelList,
    setMediaModelListLoading: state.setMediaModelListLoading,
  }));
  const { isLogin, userProfile } = useUserStoreShallow((state) => ({
    isLogin: state.isLogin,
    userProfile: state.userProfile,
  }));
  const { data, isLoading } = useListProviderItems(
    {
      query: {
        category: 'mediaGeneration',
        global: userProfile?.preferences?.providerMode === 'global',
        enabled: true,
      },
    },
    null,
    {
      enabled: isLogin,
    },
  );

  useEffect(() => {
    if (data?.data) {
      setMediaModelList(data.data);
    }
  }, [data?.data, setMediaModelList]);

  useEffect(() => {
    setMediaModelListLoading(isLoading);
  }, [isLoading, setMediaModelListLoading]);
};
