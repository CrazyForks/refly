import { IconFolder } from '@arco-design/web-react/icon';
import {
  HiOutlineDocumentText,
  HiOutlineSquare3Stack3D,
  HiOutlineSparkles,
  HiSparkles,
  HiOutlineChatBubbleLeftRight,
  HiMiniPlayCircle,
  HiOutlineCircleStack,
  HiPlus,
  HiMinus,
} from 'react-icons/hi2';
import { IoIosMore } from 'react-icons/io';
import { HiOutlineReply } from 'react-icons/hi';
import { LuSearch, LuSettings, LuCheck, LuCopy, LuTrash, LuRotateCw } from 'react-icons/lu';
import { LuView } from 'react-icons/lu';
import { RiErrorWarningLine } from 'react-icons/ri';

import { RiDoubleQuotesL } from 'react-icons/ri';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { BiText } from 'react-icons/bi';
import { PiNotePencil } from 'react-icons/pi';
import { IoLibraryOutline } from 'react-icons/io5';
import { HiOutlineChevronDown } from 'react-icons/hi';

import OpenAIIcon from '@refly-packages/ai-workspace-common/assets/openai.svg';
import AnthropicIcon from '@refly-packages/ai-workspace-common/assets/anthropic.svg';
import GeminiIcon from '@refly-packages/ai-workspace-common/assets/google-gemini-icon.svg';

export const IconProject = IconFolder;
export const IconCanvasFill = HiSparkles;
export const IconCanvas = HiOutlineSparkles;
export const IconDocument = HiOutlineDocumentText;
export const IconResource = HiOutlineSquare3Stack3D;
export const IconResponse = HiOutlineChatBubbleLeftRight;
export const IconLibrary = IoLibraryOutline;
export const IconThread = HiOutlineChatBubbleLeftRight;
export const IconPreview = LuView;
export const IconQuote = RiDoubleQuotesL;
export const IconToken = HiOutlineCircleStack;
export const IconText = BiText;
export const IconPlus = HiPlus;
export const IconMinus = HiMinus;
export const IconCheck = LuCheck;
export const IconPlay = HiMiniPlayCircle;
export const IconRerun = LuRotateCw;
export const IconReply = HiOutlineReply;
export const IconMoreHorizontal = IoIosMore;
export const IconEdit = PiNotePencil;
export const IconDelete = LuTrash;
export const IconSearch = LuSearch;
export const IconError = RiErrorWarningLine;
export const IconLoading = AiOutlineLoading3Quarters;
export const IconSettings = LuSettings;
export const IconCopy = LuCopy;
export const IconDown = HiOutlineChevronDown;

export const ModelProviderIcons = {
  openai: OpenAIIcon,
  anthropic: AnthropicIcon,
  google: GeminiIcon,
};
