import { useEffect } from 'react';

import { Item } from './item';
import { RenderItem } from './type';
import classNames from 'classnames';

export function Home({
  data,
  activeValue,
  setValue,
}: {
  data: RenderItem[];
  activeValue: string;
  setValue: (val: string) => void;
  showItemDetail: boolean;
}) {
  useEffect(() => {
    setValue('refly-built-in-ask-ai');
  }, [setValue]);

  return (
    <>
      {data?.map((item) => (
        <Item
          key={item.data.entityId}
          className={classNames(
            item?.isSelected ? 'selected' : '',
            'search-res-item dark:text-gray-200 dark:hover:bg-gray-700',
          )}
          value={`${item?.data?.title}__${item?.data?.entityId}`}
          activeValue={activeValue}
          onSelect={() => {
            item?.onItemClick(item.data);
          }}
        >
          <span className="search-res-icon dark:text-gray-300">{item?.icon}</span>
          <div className="search-res-container">
            <p
              className="search-res-title dark:!text-gray-200"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: trust server highlights
              dangerouslySetInnerHTML={{ __html: item?.data?.title ?? '' }}
              title={item?.data?.title?.replace(/<[^>]*>/g, '')}
            />
          </div>
        </Item>
      ))}
    </>
  );
}
