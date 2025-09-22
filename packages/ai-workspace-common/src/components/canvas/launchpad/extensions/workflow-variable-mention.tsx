import { Extension } from '@tiptap/core';
import { Mention } from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import { SuggestionOptions } from '@tiptap/suggestion';
import tippy, { GetReferenceClientRect, Instance, Props } from 'tippy.js';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { WorkflowVariable } from '@refly/openapi-schema';

interface VariableSuggestionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface VariableSuggestionListProps {
  items: WorkflowVariable[];
  command: (item: WorkflowVariable) => void;
  query?: string;
}

// Variable suggestion list component
const VariableSuggestionList = forwardRef<VariableSuggestionListRef, VariableSuggestionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Simplified - just use items directly since there's no source property to group by
    const currentItems = items;

    const selectItem = (index: number) => {
      const item = currentItems[index];
      if (item) {
        command(item);
      }
    };

    const upHandler = () => {
      setSelectedIndex((selectedIndex + currentItems.length - 1) % currentItems.length);
    };

    const downHandler = () => {
      setSelectedIndex((selectedIndex + 1) % currentItems.length);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          upHandler();
          return true;
        }

        if (event.key === 'ArrowDown') {
          downHandler();
          return true;
        }

        if (event.key === 'Enter') {
          enterHandler();
          return true;
        }

        return false;
      },
    }));

    const getVariableTypeColor = (variableType?: string) => {
      switch (variableType) {
        case 'string':
          return 'bg-blue-50 text-blue-600';
        case 'option':
          return 'bg-green-50 text-green-600';
        case 'resource':
          return 'bg-purple-50 text-purple-600';
        default:
          return 'bg-gray-50 text-gray-600';
      }
    };

    if (items.length === 0) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm text-gray-500">
          No variables found
        </div>
      );
    }

    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-auto p-1 min-w-[280px]">
        {currentItems.map((item, index) => (
          <button
            key={item.name}
            type="button"
            className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
              index === selectedIndex ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
            }`}
            onClick={() => selectItem(index)}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-gray-800">@{item.name}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${getVariableTypeColor(
                  item.variableType,
                )}`}
              >
                {item.variableType ?? 'string'}
              </span>
            </div>
            {item.description && (
              <div className="text-xs text-gray-500 mb-1">{item.description}</div>
            )}
            {item.value?.length && (
              <div className="text-xs text-gray-400 truncate">Current: {item.value[0]?.text}</div>
            )}
          </button>
        ))}
      </div>
    );
  },
);

VariableSuggestionList.displayName = 'VariableSuggestionList';

export interface WorkflowVariableMentionOptions {
  variables: WorkflowVariable[];
  suggestion?: Partial<SuggestionOptions>;
}

export const WorkflowVariableMention = Extension.create<WorkflowVariableMentionOptions>({
  name: 'workflowVariableMention',

  addOptions() {
    return {
      variables: [],
      suggestion: {
        char: '@',
        command: ({ editor, range, props }) => {
          // Insert the variable as a mention with special formatting
          const variableName = props.name;
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: 'mention',
                attrs: {
                  id: variableName,
                  label: variableName,
                },
              },
              {
                type: 'text',
                text: ' ',
              },
            ])
            .run();
        },
      },
    };
  },

  addExtensions() {
    return [
      Mention.configure({
        HTMLAttributes: {
          class: 'mention bg-blue-100 text-blue-800 px-1 py-0.5 rounded text-sm font-medium',
        },
        suggestion: {
          ...this.options.suggestion,
          items: ({ query }) => {
            const variables = this.options.variables ?? [];

            // Further filter by query if provided
            if (!query) {
              return variables ?? [];
            }

            return (
              variables?.filter((variable) =>
                variable.name.toLowerCase().includes(query.toLowerCase()),
              ) ?? []
            );
          },
          render: () => {
            let component: ReactRenderer<VariableSuggestionListRef>;
            let popup: Instance<Props>[];

            return {
              onStart: (props) => {
                component = new ReactRenderer(VariableSuggestionList, {
                  props,
                  editor: props.editor,
                });

                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect as GetReferenceClientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                  maxWidth: 'none',
                });
              },

              onUpdate(props) {
                component.updateProps(props);

                popup[0].setProps({
                  getReferenceClientRect: props.clientRect as GetReferenceClientRect,
                });
              },

              onKeyDown(props) {
                if (props.event.key === 'Escape') {
                  popup[0].hide();
                  return true;
                }

                return component.ref?.onKeyDown(props) ?? false;
              },

              onExit() {
                popup[0].destroy();
                component.destroy();
              },
            };
          },
        },
      }),
    ];
  },
});
